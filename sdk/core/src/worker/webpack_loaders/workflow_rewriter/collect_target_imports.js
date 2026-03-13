import traverseModule from '@babel/traverse';
import {
  buildWorkflowNameMap,
  getLocalNameFromDestructuredProperty,
  isEvaluatorsPath,
  isSharedEvaluatorsPath,
  isSharedStepsPath,
  isStepsPath,
  isWorkflowPath,
  buildStepsNameMap,
  buildSharedStepsNameMap,
  buildEvaluatorsNameMap,
  buildSharedEvaluatorsNameMap,
  toAbsolutePath
} from '../tools.js';
import {
  isCallExpression,
  isIdentifier,
  isImportDefaultSpecifier,
  isImportSpecifier,
  isObjectPattern,
  isObjectProperty,
  isStringLiteral,
  isVariableDeclaration
} from '@babel/types';

// Handle CJS/ESM interop for Babel packages when executed as a webpack loader
const traverse = traverseModule.default ?? traverseModule;

const unresolvedImportError = ( name, fileLabel, filePath ) =>
  new Error(
    `Unresolved import '${name}' from ${fileLabel} file '${filePath}'. ` +
    'This export may have been defined with the wrong component type. ' +
    'Use the matching factory function for the file ' +
    '(e.g. step() in steps files, evaluator() in evaluators files, workflow() in workflow files).'
  );

const removeRequireDeclarator = path => {
  if ( isVariableDeclaration( path.parent ) && path.parent.declarations.length === 1 ) {
    path.parentPath.remove();
  } else {
    path.remove();
  }
};

const collectDestructuredRequires = ( path, absolutePath, req, descriptors ) => {
  const propFilter = p => isObjectProperty( p ) && isIdentifier( p.key );
  for ( const { match, buildMap, cache, target, valueKey, label } of descriptors ) {
    if ( !match( req ) ) {
      continue;
    }
    const nameMap = buildMap( absolutePath, cache );
    for ( const prop of path.node.id.properties.filter( propFilter ) ) {
      const importedName = prop.key.name;
      const localName = getLocalNameFromDestructuredProperty( prop );
      if ( localName ) {
        const resolved = nameMap.get( importedName );
        if ( resolved ) {
          target.push( { localName, [valueKey]: resolved } );
        } else {
          throw unresolvedImportError( importedName, label, absolutePath );
        }
      }
    }
    removeRequireDeclarator( path );
    return;
  }
};

/**
 * Collect and strip target imports and requires from an AST, producing
 * step/workflow import mappings for later rewrites.
 *
 * Mutates the AST by removing matching import declarations and require declarators.
 *
 * @param {import('@babel/types').File} ast - Parsed file AST.
 * @param {string} fileDir - Absolute directory of the file represented by `ast`.
 * @param {{ stepsNameCache: Map<string,Map<string,string>>, workflowNameCache: Map<string,{default:(string|null),named:Map<string,string>}> }} caches
 *  Resolved-name caches to avoid re-reading same modules.
 * @returns {{ stepImports: Array<{localName:string,stepName:string}>,
 *  flowImports: Array<{localName:string,workflowName:string}> }} Collected info mappings.
 */
export default function collectTargetImports(
  ast, fileDir,
  { stepsNameCache, workflowNameCache, evaluatorsNameCache, sharedStepsNameCache, sharedEvaluatorsNameCache }
) {
  const stepImports = [];
  const sharedStepImports = [];
  const flowImports = [];
  const evaluatorImports = [];
  const sharedEvaluatorImports = [];

  traverse( ast, {
    ImportDeclaration: path => {
      const src = path.node.source.value;
      // Ignore other imports
      const isTargetImport = isStepsPath( src ) || isSharedStepsPath( src ) ||
        isWorkflowPath( src ) || isEvaluatorsPath( src ) || isSharedEvaluatorsPath( src );
      if ( !isTargetImport ) {
        return;
      }

      const absolutePath = toAbsolutePath( fileDir, src );
      const collectNamedImports = ( match, buildMapFn, cache, targetArr, valueKey, fileLabel ) => {
        if ( !match ) {
          return;
        }
        const nameMap = buildMapFn( absolutePath, cache );
        for ( const s of path.node.specifiers.filter( s => isImportSpecifier( s ) ) ) {
          const importedName = s.imported.name;
          const localName = s.local.name;
          const value = nameMap.get( importedName );
          if ( value ) {
            const entry = { localName };
            entry[valueKey] = value;
            targetArr.push( entry );
          } else {
            throw unresolvedImportError( importedName, fileLabel, absolutePath );
          }
        }
      };

      collectNamedImports( isStepsPath( src ), buildStepsNameMap, stepsNameCache, stepImports, 'stepName', 'steps' );
      collectNamedImports( isSharedStepsPath( src ), buildSharedStepsNameMap, sharedStepsNameCache, sharedStepImports, 'stepName', 'shared steps' );
      collectNamedImports( isEvaluatorsPath( src ), buildEvaluatorsNameMap, evaluatorsNameCache, evaluatorImports, 'evaluatorName', 'evaluators' );
      collectNamedImports(
        isSharedEvaluatorsPath( src ), buildSharedEvaluatorsNameMap,
        sharedEvaluatorsNameCache, sharedEvaluatorImports, 'evaluatorName', 'shared evaluators'
      );
      if ( isWorkflowPath( src ) ) {
        const { named, default: defName } = buildWorkflowNameMap( absolutePath, workflowNameCache );
        for ( const s of path.node.specifiers ) {
          if ( isImportDefaultSpecifier( s ) ) {
            const localName = s.local.name;
            flowImports.push( { localName, workflowName: defName ?? localName } );
          } else if ( isImportSpecifier( s ) ) {
            const importedName = s.imported.name;
            const localName = s.local.name;
            const workflowName = named.get( importedName );
            if ( workflowName ) {
              flowImports.push( { localName, workflowName } );
            } else {
              throw unresolvedImportError( importedName, 'workflow', absolutePath );
            }
          }
        }
      }
      path.remove();
    },
    VariableDeclarator: path => {
      const init = path.node.init;
      if ( !isCallExpression( init ) ) {
        return;
      }
      if ( !isIdentifier( init.callee, { name: 'require' } ) ) {
        return;
      }
      const firstArgument = init.arguments[0];
      if ( !isStringLiteral( firstArgument ) ) {
        return;
      }

      const req = firstArgument.value;
      const isTargetRequire = isStepsPath( req ) || isSharedStepsPath( req ) ||
        isWorkflowPath( req ) || isEvaluatorsPath( req ) || isSharedEvaluatorsPath( req );
      if ( !isTargetRequire ) {
        return;
      }

      const absolutePath = toAbsolutePath( fileDir, req );

      // Destructured requires: const { X } = require('./steps.js')
      if ( isObjectPattern( path.node.id ) ) {
        const cjsDescriptors = [
          {
            match: isStepsPath, buildMap: buildStepsNameMap,
            cache: stepsNameCache, target: stepImports,
            valueKey: 'stepName', label: 'steps'
          },
          {
            match: isSharedStepsPath, buildMap: buildSharedStepsNameMap,
            cache: sharedStepsNameCache ?? stepsNameCache,
            target: sharedStepImports,
            valueKey: 'stepName', label: 'shared steps'
          },
          {
            match: isEvaluatorsPath, buildMap: buildEvaluatorsNameMap,
            cache: evaluatorsNameCache, target: evaluatorImports,
            valueKey: 'evaluatorName', label: 'evaluators'
          },
          {
            match: isSharedEvaluatorsPath, buildMap: buildSharedEvaluatorsNameMap,
            cache: sharedEvaluatorsNameCache ?? evaluatorsNameCache,
            target: sharedEvaluatorImports,
            valueKey: 'evaluatorName', label: 'shared evaluators'
          },
          {
            match: isWorkflowPath,
            buildMap: ( p, c ) => buildWorkflowNameMap( p, c ).named,
            cache: workflowNameCache, target: flowImports,
            valueKey: 'workflowName', label: 'workflow'
          }
        ];
        collectDestructuredRequires(
          path, absolutePath, req, cjsDescriptors
        );
        return;
      }

      // Default workflow require: const WF = require('./workflow.js')
      if ( isWorkflowPath( req ) && isIdentifier( path.node.id ) ) {
        const { default: defName } = buildWorkflowNameMap( absolutePath, workflowNameCache );
        const localName = path.node.id.name;
        flowImports.push( { localName, workflowName: defName ?? localName } );
        removeRequireDeclarator( path );
      }
    }
  } );

  return { stepImports, sharedStepImports, evaluatorImports, sharedEvaluatorImports, flowImports };
};
