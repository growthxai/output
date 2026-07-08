import traverseModule from '@babel/traverse';
import {
  buildEvaluatorsNameMap,
  buildSharedEvaluatorsNameMap,
  buildSharedStepsNameMap,
  buildStepsNameMap,
  getLocalNameFromDestructuredProperty,
  isEvaluatorsPath,
  isSharedEvaluatorsPath,
  isSharedStepsPath,
  isStepsPath,
  toAbsolutePath
} from '../tools.js';

import {
  isCallExpression,
  isIdentifier,
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
  for ( const { match, buildMap, cache, label, target } of descriptors ) {
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
          target.push( { localName, activityName: resolved } );
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
 * activity import mappings for later rewrites.
 *
 * Mutates the AST by removing matching import declarations and require declarators.
 *
 * @param {import('@babel/types').File} ast - Parsed file AST.
 * @param {string} fileDir - Absolute directory of the file represented by `ast`.
 * @param {{ stepsNameCache: Map<string,Map<string,string>> }} caches
 *  Resolved-name caches to avoid re-reading same modules.
 * @returns {{ activityImports: Array<{localName:string,activityName:string}> }} Collected import mappings.
 */
export default function collectTargetImports(
  ast, fileDir,
  { stepsNameCache, evaluatorsNameCache, sharedStepsNameCache, sharedEvaluatorsNameCache }
) {
  const activityImports = [];

  traverse( ast, {
    ImportDeclaration: path => {
      const src = path.node.source.value;

      const isTargetImport = isStepsPath( src ) || isSharedStepsPath( src ) ||
        isEvaluatorsPath( src ) || isSharedEvaluatorsPath( src );
      if ( !isTargetImport ) {
        return;
      }

      const absolutePath = toAbsolutePath( fileDir, src );
      const collectNamedImports = ( match, buildMapFn, cache, fileLabel ) => {
        if ( !match ) {
          return;
        }
        const nameMap = buildMapFn( absolutePath, cache );
        for ( const s of path.node.specifiers.filter( s => isImportSpecifier( s ) ) ) {
          const importedName = s.imported.name;
          const localName = s.local.name;
          const value = nameMap.get( importedName );
          if ( value ) {
            activityImports.push( { localName, activityName: value } );
          } else {
            throw unresolvedImportError( importedName, fileLabel, absolutePath );
          }
        }
      };

      collectNamedImports( isStepsPath( src ), buildStepsNameMap, stepsNameCache, 'steps' );
      collectNamedImports( isSharedStepsPath( src ), buildSharedStepsNameMap, sharedStepsNameCache, 'shared steps' );
      collectNamedImports( isEvaluatorsPath( src ), buildEvaluatorsNameMap, evaluatorsNameCache, 'evaluators' );
      collectNamedImports( isSharedEvaluatorsPath( src ), buildSharedEvaluatorsNameMap, sharedEvaluatorsNameCache, 'shared evaluators' );
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
        isEvaluatorsPath( req ) || isSharedEvaluatorsPath( req );
      if ( !isTargetRequire ) {
        return;
      }

      const absolutePath = toAbsolutePath( fileDir, req );

      if ( isObjectPattern( path.node.id ) ) {
        const cjsDescriptors = [
          {
            match: isStepsPath, buildMap: buildStepsNameMap,
            cache: stepsNameCache, target: activityImports, label: 'steps'
          },
          {
            match: isSharedStepsPath, buildMap: buildSharedStepsNameMap,
            cache: sharedStepsNameCache ?? stepsNameCache,
            target: activityImports, label: 'shared steps'
          },
          {
            match: isEvaluatorsPath, buildMap: buildEvaluatorsNameMap,
            cache: evaluatorsNameCache, target: activityImports, label: 'evaluators'
          },
          {
            match: isSharedEvaluatorsPath, buildMap: buildSharedEvaluatorsNameMap,
            cache: sharedEvaluatorsNameCache ?? evaluatorsNameCache,
            target: activityImports, label: 'shared evaluators'
          }
        ];
        collectDestructuredRequires(
          path, absolutePath, req, cjsDescriptors
        );
        return;
      }
    }
  } );

  return { activityImports };
}
