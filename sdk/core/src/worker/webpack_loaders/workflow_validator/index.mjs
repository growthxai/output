import traverseModule from '@babel/traverse';
import { dirname } from 'node:path';
import { parse, toAbsolutePath, getFileKind, isAnyStepsPath, isAnyEvaluatorsPath, isWorkflowPath } from '../tools.js';
import { ComponentFile } from '../consts.js';
import {
  isCallExpression,
  isFunctionExpression,
  isArrowFunctionExpression,
  isIdentifier,
  isImportDefaultSpecifier,
  isImportSpecifier,
  isObjectPattern,
  isObjectProperty,
  isStringLiteral
} from '@babel/types';

// Handle CJS/ESM interop for Babel packages when executed as a webpack loader
const traverse = traverseModule.default ?? traverseModule;

/**
 * Determine the file kind label for error messages.
 * Handles both flat files (steps.js) and folder-based files (steps/fetch_data.js).
 * @param {string} filename - The file path
 * @returns {string} Human-readable file kind for error messages
 */
const getFileKindLabel = filename => {
  if ( isAnyStepsPath( filename ) ) {
    return 'steps.js';
  }
  if ( isAnyEvaluatorsPath( filename ) ) {
    return 'evaluators.js';
  }
  if ( /workflow\.js$/.test( filename ) ) {
    return 'workflow.js';
  }
  return filename;
};

/**
 * Validate that component instantiation calls occur in the correct file locations.
 * - step() must be called in a file whose path contains 'steps'
 * - evaluator() must be called in a file whose path contains 'evaluators'
 * - workflow() must be called in a file whose path contains 'workflow'
 * @param {string} calleeName - The factory function name (step, evaluator, workflow)
 * @param {string} filename - The file path where the call occurs
 */
const validateInstantiationLocation = ( calleeName, filename ) => {
  if ( calleeName === 'step' && !isAnyStepsPath( filename ) ) {
    throw new Error( `Invalid instantiation location: step() can only be called in files with 'steps' in the path. Found in: ${filename}` );
  }
  if ( calleeName === 'evaluator' && !isAnyEvaluatorsPath( filename ) ) {
    throw new Error( `Invalid instantiation location: evaluator() can only be called in files with 'evaluators' in the path. Found in: ${filename}` );
  }
  if ( calleeName === 'workflow' && !isWorkflowPath( filename ) ) {
    throw new Error( `Invalid instantiation location: workflow() can only be called in files with 'workflow' in the path. Found in: ${filename}` );
  }
};

/**
 * Webpack loader that validates component instantiation and fn body calls.
 * Returns the source unchanged unless a validation error is found.
 *
 * Rules enforced:
 *  - Instantiation location: step() must be in steps path, evaluator() in evaluators path, workflow() in workflow path
 *  - steps.js `fn`: calling any step, evaluator, or workflow inside fn body emits warning
 *  - evaluators.js `fn`: calling any step, evaluator, or workflow inside fn body emits warning
 *
 * NOTE: Import restrictions have been removed - any file can import any other file.
 *
 * @param {string|Buffer} source
 * @param {any} inputMap
 * @this {import('webpack').LoaderContext<{}>}
 */
export default function workflowValidatorLoader( source, inputMap ) {
  this.cacheable?.( true );
  const callback = this.async?.() ?? this.callback;
  const emitWarning = this.emitWarning?.bind( this ) ?? ( () => {} );

  try {
    const filename = this.resourcePath;
    const fileDir = dirname( filename );
    const ast = parse( String( source ), filename );

    const fileKind = getFileKind( filename );

    // Collect local declarations and imported identifiers by type
    const localStepIds = new Set();
    const localEvaluatorIds = new Set();
    const importedStepIds = new Set();
    const importedEvaluatorIds = new Set();
    const importedWorkflowIds = new Set();

    // First pass: collect imported identifiers for fn body call checks
    traverse( ast, {
      ImportDeclaration: path => {
        const specifier = path.node.source.value;

        // Collect imported identifiers for later call checks
        const importedKind = getFileKind( specifier );
        const accumulator = ( {
          [ComponentFile.STEPS]: importedStepIds,
          [ComponentFile.EVALUATORS]: importedEvaluatorIds,
          [ComponentFile.WORKFLOW]: importedWorkflowIds
        } )[importedKind];
        if ( accumulator ) {
          for ( const s of path.node.specifiers ) {
            if ( isImportSpecifier( s ) || isImportDefaultSpecifier( s ) ) {
              accumulator.add( s.local.name );
            }
          }
        }
      },
      VariableDeclarator: path => {
        const init = path.node.init;
        if ( !isCallExpression( init ) ) {
          return;
        }

        // Validate instantiation location for step/evaluator/workflow calls
        if ( isIdentifier( init.callee, { name: 'step' } ) ) {
          validateInstantiationLocation( 'step', filename );
          if ( isIdentifier( path.node.id ) ) {
            localStepIds.add( path.node.id.name );
          }
        }
        if ( isIdentifier( init.callee, { name: 'evaluator' } ) ) {
          validateInstantiationLocation( 'evaluator', filename );
          if ( isIdentifier( path.node.id ) ) {
            localEvaluatorIds.add( path.node.id.name );
          }
        }
        if ( isIdentifier( init.callee, { name: 'workflow' } ) ) {
          validateInstantiationLocation( 'workflow', filename );
        }

        // CommonJS requires: collect identifiers for fn body call checks
        if ( isIdentifier( init.callee, { name: 'require' } ) ) {
          const firstArg = init.arguments[0];
          if ( !isStringLiteral( firstArg ) ) {
            return;
          }
          const req = firstArg.value;

          // Collect imported identifiers from require patterns
          const reqType = getFileKind( toAbsolutePath( fileDir, req ) );
          if ( reqType === ComponentFile.STEPS && isObjectPattern( path.node.id ) ) {
            for ( const prop of path.node.id.properties ) {
              if ( isObjectProperty( prop ) && isIdentifier( prop.value ) ) {
                importedStepIds.add( prop.value.name );
              }
            }
          }
          if ( reqType === ComponentFile.EVALUATORS && isObjectPattern( path.node.id ) ) {
            for ( const prop of path.node.id.properties ) {
              if ( isObjectProperty( prop ) && isIdentifier( prop.value ) ) {
                importedEvaluatorIds.add( prop.value.name );
              }
            }
          }
          if ( reqType === ComponentFile.WORKFLOW && isIdentifier( path.node.id ) ) {
            importedWorkflowIds.add( path.node.id.name );
          }
        }
      }
    } );

    // Function-body call validations for steps/evaluators files
    if ( [ ComponentFile.STEPS, ComponentFile.EVALUATORS ].includes( fileKind ) ) {
      traverse( ast, {
        ObjectProperty: path => {
          if ( !isIdentifier( path.node.key, { name: 'fn' } ) ) {
            return;
          }
          const val = path.node.value;
          if ( !isFunctionExpression( val ) && !isArrowFunctionExpression( val ) ) {
            return;
          }

          path.get( 'value' ).traverse( {
            CallExpression: cPath => {
              const callee = cPath.node.callee;
              if ( isIdentifier( callee ) ) {
                const { name } = callee;
                const fileLabel = getFileKindLabel( filename );
                const violation = [
                  [ 'step', localStepIds.has( name ) || importedStepIds.has( name ) ],
                  [ 'evaluator', localEvaluatorIds.has( name ) || importedEvaluatorIds.has( name ) ],
                  [ 'workflow', importedWorkflowIds.has( name ) ]
                ].find( v => v[1] )?.[0];

                if ( violation ) {
                  emitWarning( new Error( `Invalid call in ${fileLabel} fn: calling a ${violation} ('${name}') is not allowed in ${filename}` ) );
                }
              }
            }
          } );
        }
      } );
    }

    return callback( null, source, inputMap );
  } catch ( err ) {
    return callback( err );
  }
}
