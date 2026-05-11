import { createRequire } from 'node:module';
import { dirname, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  isExportAllDeclaration,
  isExportNamedDeclaration,
  isExportSpecifier,
  isIdentifier,
  isImportDefaultSpecifier,
  isImportNamespaceSpecifier,
  isImportSpecifier,
  isStringLiteral
} from '@babel/types';
import { existsSync, readFileSync } from 'node:fs';
import { parse, isWorkflowPath, buildWorkflowNameMap } from './tools.js';

/**
 * Resolves bare npm imports to workflow runtime names:
 * - `require.resolve` from the importing file locates the package entry or subpath.
 * - Follows `export { ... } from` and `export * from` until a module whose path ends in `workflow.js`.
 * - Reads declared names via {@link buildWorkflowNameMap} on that terminal file.
 *
 * The rewriter applies this only when the importing resource is `workflow.js` (see collect_target_imports).
 * The workflow validator also uses it for steps/evaluators so catalog imports are recognized in `fn`.
 */

/**
 * True for npm-style bare specifiers we may resolve with `require.resolve`.
 * Excludes relative paths, absolute paths, and built-in / URL protocols.
 *
 * @param {string} specifier - ESM import source or `require()` string.
 * @returns {boolean}
 */
export const isBareNpmSpecifier = specifier => {
  if ( typeof specifier !== 'string' || specifier.length === 0 ) {
    return false;
  }
  if ( specifier.startsWith( '.' ) || specifier.startsWith( '/' ) ) {
    return false;
  }
  if ( specifier.startsWith( 'node:' ) || specifier.startsWith( 'file:' ) ||
    specifier.startsWith( 'data:' ) || specifier.startsWith( 'http:' ) ||
    specifier.startsWith( 'https:' ) ) {
    return false;
  }
  return true;
};

/**
 * True when the absolute path ends with a `workflow.js` segment (same rule as path-based workflow files).
 *
 * @param {string} absolutePath - Resolved absolute file path.
 * @returns {boolean}
 */
const absolutePathIsWorkflowJsFile = absolutePath =>
  isWorkflowPath( absolutePath.replace( /\\/g, '/' ) );

const unsupportedNamespaceWorkflowImportError = specifier => new Error(
  `Namespace imports from workflow package "${specifier}" are not supported. ` +
  `Use named imports instead, e.g. import { myWorkflow } from '${specifier}'.`
);

/**
 * Split a bare npm specifier into its package name and package export subpath.
 *
 * Handles both unscoped packages (`pkg/path`) and scoped packages (`@scope/pkg/path`).
 *
 * @param {string} specifier - Bare npm specifier from an import or require call.
 * @returns {{ packageName: string, subpath: string }} Package name and exports-style subpath.
 */
const packagePartsFromSpecifier = specifier => {
  const parts = specifier.split( '/' );
  if ( specifier.startsWith( '@' ) ) {
    return {
      packageName: parts.slice( 0, 2 ).join( '/' ),
      subpath: parts.length > 2 ? `./${parts.slice( 2 ).join( '/' )}` : '.'
    };
  }
  return {
    packageName: parts[0],
    subpath: parts.length > 1 ? `./${parts.slice( 1 ).join( '/' )}` : '.'
  };
};

/**
 * Walk upward from a source directory to find the package.json for an installed dependency.
 *
 * Mirrors Node's nearest `node_modules` lookup so temporary tests and nested workspace layouts resolve consistently.
 *
 * @param {string} fromDir - Directory where package resolution starts.
 * @param {string} packageName - Bare package name, including scope for scoped packages.
 * @returns {string|null} Absolute package.json path, or null when the package is not installed.
 */
const findPackageJson = ( fromDir, packageName ) => {
  const candidate = resolvePath( fromDir, 'node_modules', packageName, 'package.json' );
  if ( existsSync( candidate ) ) {
    return candidate;
  }
  const parent = dirname( fromDir );
  return parent !== fromDir ? findPackageJson( parent, packageName ) : null;
};

/**
 * Choose the best concrete file target from a package exports target.
 *
 * Prefers the workflow-specific webpack condition, then the same fallback conditions used by
 * `webpackConfigHook`.
 *
 * @param {string|Array|object|null|undefined} target - Value from package.json `exports`.
 * @returns {string|null} Relative file target, or null when no supported condition resolves.
 */
const resolveConditionalExportTarget = target => {
  if ( typeof target === 'string' ) {
    return target;
  }
  if ( Array.isArray( target ) ) {
    for ( const item of target ) {
      const resolved = resolveConditionalExportTarget( item );
      if ( resolved ) {
        return resolved;
      }
    }
    return null;
  }
  if ( !target || typeof target !== 'object' ) {
    return null;
  }

  for ( const condition of [ 'output-workflow-bundle', 'import', 'module', 'webpack', 'default' ] ) {
    if ( condition in target ) {
      const resolved = resolveConditionalExportTarget( target[condition] );
      if ( resolved ) {
        return resolved;
      }
    }
  }
  return null;
};

/**
 * Resolve a bare package specifier using the `output-workflow-bundle` export condition when present.
 *
 * This keeps AST workflow import resolution aligned with webpack's configured condition order before
 * falling back to Node's `require.resolve`.
 *
 * @param {string} fromAbsoluteFile - Absolute path to the importing module.
 * @param {string} specifier - Bare npm package specifier.
 * @returns {string|null} Absolute module path selected from package exports, or null when unsupported.
 */
const resolveBareSpecifierWithOutputCondition = ( fromAbsoluteFile, specifier ) => {
  const { packageName, subpath } = packagePartsFromSpecifier( specifier );
  const pkgJsonPath = findPackageJson( dirname( fromAbsoluteFile ), packageName );
  if ( !pkgJsonPath ) {
    return null;
  }

  const pkgRoot = dirname( pkgJsonPath );
  const pkg = ( () => {
    try {
      return JSON.parse( readFileSync( pkgJsonPath, 'utf8' ) );
    } catch {
      return {};
    }
  } )();
  const exportsIsRootConditionMap = pkg.exports && typeof pkg.exports === 'object' && !Array.isArray( pkg.exports ) &&
    Object.keys( pkg.exports ).every( key => !key.startsWith( '.' ) );
  const exportTarget = ( () => {
    if ( typeof pkg.exports === 'string' && subpath === '.' ) {
      return pkg.exports;
    }
    if ( subpath === '.' && exportsIsRootConditionMap ) {
      return pkg.exports;
    }
    if ( pkg.exports && typeof pkg.exports === 'object' ) {
      return pkg.exports[subpath];
    }
    return null;
  } )();
  const conditionTarget = resolveConditionalExportTarget( exportTarget );
  return conditionTarget ? resolvePath( pkgRoot, conditionTarget ) : null;
};

/**
 * @param {import('@babel/types').Identifier | import('@babel/types').StringLiteral} node
 * @returns {string}
 */
const exportSpecifierName = node => ( isIdentifier( node ) ? node.name : node.value );

/**
 * Resolve a named export by following `export { ... } from` and `export * from` chains until
 * a `workflow.js` module is reached, then read the workflow runtime name via {@link buildWorkflowNameMap}.
 *
 * @param {string} moduleAbsPath - Absolute path to the current module file.
 * @param {string} soughtExportedName - Public export name (`'default'` for default export).
 * @param {Set<string>} visited - Cycle guard keys `path::exportName`.
 * @param {Map<string, {default: (string|null), named: Map<string,string>}>} workflowNameCache
 * @returns {string|null} Declared workflow `name` or null if not resolved as a workflow.
 */
const resolveNamedExportThroughReexports = (
  moduleAbsPath, soughtExportedName, visited, workflowNameCache
) => {
  const visitKey = `${moduleAbsPath}::${soughtExportedName}`;
  if ( visited.has( visitKey ) ) {
    return null;
  }
  visited.add( visitKey );

  if ( absolutePathIsWorkflowJsFile( moduleAbsPath ) ) {
    const wfMap = buildWorkflowNameMap( moduleAbsPath, workflowNameCache );
    if ( soughtExportedName === 'default' ) {
      return wfMap.default;
    }
    return wfMap.named.get( soughtExportedName ) ?? null;
  }

  const ast = ( () => {
    try {
      return parse( readFileSync( moduleAbsPath, 'utf8' ), moduleAbsPath );
    } catch {
      return null;
    }
  } )();
  if ( !ast ) {
    return null;
  }
  const moduleDir = dirname( moduleAbsPath );

  for ( const node of ast.program.body ) {
    if ( !isExportNamedDeclaration( node ) || !node.source ) {
      continue;
    }
    const targetAbs = resolvePath( moduleDir, node.source.value );
    for ( const spec of node.specifiers ) {
      if ( !isExportSpecifier( spec ) ) {
        continue;
      }
      const exported = exportSpecifierName( spec.exported );
      if ( exported !== soughtExportedName ) {
        continue;
      }
      const remoteName = exportSpecifierName( spec.local );
      const inner = remoteName === 'default' ? 'default' : remoteName;
      const resolved = resolveNamedExportThroughReexports(
        targetAbs, inner, visited, workflowNameCache
      );
      if ( resolved ) {
        return resolved;
      }
    }
  }

  for ( const node of ast.program.body ) {
    if ( !isExportAllDeclaration( node ) || !isStringLiteral( node.source ) ) {
      continue;
    }
    const targetAbs = resolvePath( moduleDir, node.source.value );
    const resolved = resolveNamedExportThroughReexports(
      targetAbs, soughtExportedName, visited, workflowNameCache
    );
    if ( resolved ) {
      return resolved;
    }
  }

  return null;
};

/**
 * Returns true when a module is itself a workflow.js file or re-exports a module that is.
 *
 * @param {string} moduleAbsPath
 * @param {Set<string>} [visited]
 * @returns {boolean}
 */
const moduleMayExportWorkflows = ( moduleAbsPath, visited = new Set() ) => {
  if ( visited.has( moduleAbsPath ) ) {
    return false;
  }
  visited.add( moduleAbsPath );
  if ( absolutePathIsWorkflowJsFile( moduleAbsPath ) ) {
    return true;
  }
  const ast = ( () => {
    try {
      return parse( readFileSync( moduleAbsPath, 'utf8' ), moduleAbsPath );
    } catch {
      return null;
    }
  } )();
  if ( !ast ) {
    return false;
  }
  const moduleDir = dirname( moduleAbsPath );
  for ( const node of ast.program.body ) {
    if ( isExportAllDeclaration( node ) && isStringLiteral( node.source ) ) {
      if ( moduleMayExportWorkflows( resolvePath( moduleDir, node.source.value ), visited ) ) {
        return true;
      }
    }
    if ( isExportNamedDeclaration( node ) && isStringLiteral( node.source ) ) {
      if ( moduleMayExportWorkflows( resolvePath( moduleDir, node.source.value ), visited ) ) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Resolve the package entry (or subpath) for `specifier` from `fromAbsoluteFile`, then follow
 * re-exports until `workflow.js` is reached.
 *
 * @param {string} fromAbsoluteFile - Absolute path to the importing file (e.g. `workflow.js`).
 * @param {string} specifier - Bare npm specifier or subpath import.
 * @returns {string|null} Absolute path to the resolved entry file, or null on failure.
 */
const resolveBareSpecifierToFirstModule = ( fromAbsoluteFile, specifier ) => {
  const conditionalEntry = resolveBareSpecifierWithOutputCondition( fromAbsoluteFile, specifier );
  if ( conditionalEntry ) {
    return conditionalEntry;
  }
  try {
    const req = createRequire( pathToFileURL( fromAbsoluteFile ).href );
    return req.resolve( specifier );
  } catch {
    return null;
  }
};

/**
 * For each ESM import specifier from a bare npm module, resolve the bound workflow runtime name.
 * All specifiers must resolve as workflows; otherwise returns `none` (caller leaves the import alone)
 * or `partial` (caller should throw).
 *
 * @param {object} params
 * @param {string} params.fromAbsoluteFile - Absolute path to the importing `workflow.js`.
 * @param {string} params.specifier - Bare npm import source.
 * @param {readonly import('@babel/types').ImportDeclaration['specifiers']} params.specifiers
 * @param {Map<string, {default: (string|null), named: Map<string,string>}>} params.workflowNameCache
 * @returns {{ type: 'all', bindings: Array<{ localName: string, workflowName: string }> } |
 *   { type: 'none' } | { type: 'partial' }}
 * @throws {Error} When a namespace import targets a workflow package.
 */
export const resolveBareImportSpecifiersAsWorkflows = ( {
  fromAbsoluteFile,
  specifier,
  specifiers,
  workflowNameCache
} ) => {
  const entry = resolveBareSpecifierToFirstModule( fromAbsoluteFile, specifier );
  if ( !entry ) {
    return { type: 'none' };
  }

  if ( specifiers.some( isImportNamespaceSpecifier ) ) {
    if ( moduleMayExportWorkflows( entry ) ) {
      throw unsupportedNamespaceWorkflowImportError( specifier );
    }
    return { type: 'none' };
  }

  const rows = [];
  const visited = new Set();

  for ( const sp of specifiers ) {
    const binding = ( () => {
      if ( isImportDefaultSpecifier( sp ) ) {
        return { soughtExport: 'default', localName: sp.local.name };
      }
      if ( isImportSpecifier( sp ) ) {
        return { soughtExport: sp.imported.name, localName: sp.local.name };
      }
      return null;
    } )();
    if ( !binding ) {
      return { type: 'none' };
    }
    const { soughtExport, localName } = binding;

    const workflowName = resolveNamedExportThroughReexports(
      entry, soughtExport, visited, workflowNameCache
    );
    rows.push( { localName, workflowName } );
  }

  const resolvedCount = rows.filter( r => r.workflowName ).length;
  if ( resolvedCount === 0 ) {
    return { type: 'none' };
  }
  if ( resolvedCount !== rows.length ) {
    return { type: 'partial' };
  }
  return { type: 'all', bindings: rows };
};

/**
 * Resolves `const { a, b } = require('bare')` the same way as ESM imports (all keys must be workflows).
 *
 * @param {object} params
 * @param {string} params.fromAbsoluteFile
 * @param {string} params.specifier
 * @param {readonly import('@babel/types').ObjectPattern['properties']} params.properties
 * @param {Map<string, {default: (string|null), named: Map<string,string>}>} params.workflowNameCache
 * @returns {{ type: 'all', bindings: Array<{ localName: string, workflowName: string }> } |
 *   { type: 'none' } | { type: 'partial' }}
 */
export const resolveBareDestructuredRequireAsWorkflows = ( {
  fromAbsoluteFile,
  specifier,
  properties,
  workflowNameCache
} ) => {
  const entry = resolveBareSpecifierToFirstModule( fromAbsoluteFile, specifier );
  if ( !entry ) {
    return { type: 'none' };
  }

  const rows = [];
  const visited = new Set();

  for ( const prop of properties ) {
    if ( prop.type !== 'ObjectProperty' || !isIdentifier( prop.key ) ) {
      continue;
    }
    const importedName = prop.key.name;
    const val = prop.value;
    const localName = isIdentifier( val ) ? val.name : null;
    if ( !localName ) {
      return { type: 'partial' };
    }
    const workflowName = resolveNamedExportThroughReexports(
      entry, importedName, visited, workflowNameCache
    );
    rows.push( { localName, workflowName } );
  }

  if ( rows.length === 0 ) {
    return { type: 'none' };
  }
  const resolvedCount = rows.filter( r => r.workflowName ).length;
  if ( resolvedCount === 0 ) {
    return { type: 'none' };
  }
  if ( resolvedCount !== rows.length ) {
    return { type: 'partial' };
  }
  return { type: 'all', bindings: rows };
};

/**
 * Default `require('bare')` as a single default workflow binding.
 *
 * @param {string} fromAbsoluteFile
 * @param {string} specifier
 * @param {string} localName
 * @param {Map<string, {default: (string|null), named: Map<string,string>}>} workflowNameCache
 * @returns {{ type: 'binding', localName: string, workflowName: string } | { type: 'none' } | { type: 'partial' }}
 */
export const resolveBareDefaultRequireAsWorkflow = (
  fromAbsoluteFile, specifier, localName, workflowNameCache
) => {
  const entry = resolveBareSpecifierToFirstModule( fromAbsoluteFile, specifier );
  if ( !entry ) {
    return { type: 'none' };
  }
  const visited = new Set();
  const workflowName = resolveNamedExportThroughReexports(
    entry, 'default', visited, workflowNameCache
  );
  if ( !workflowName ) {
    return { type: 'none' };
  }
  return { type: 'binding', localName, workflowName };
};
