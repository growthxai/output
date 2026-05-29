import { dirname, resolve, sep } from 'path';
import { pathToFileURL } from 'url';
import { METADATA_ACCESS_SYMBOL } from '#consts';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'fs';
import { hashElement } from 'folder-hash';

/**
 * Returns the real path for symlink
 *
 * If the link is broken, returns null
 *
 * @param {string} link - The symlink to resolve
 * @returns {string|null} The real path or null if it is unresolvable
 */
export const resolveSymlink = link => {
  try {
    return realpathSync( link );
  } catch {
    return null;
  }
};

/**
 * Returns matchers that need to be built using a relative path
 *
 * @param {string} path
 * @returns {object} The object containing the matchers
 */
export const activityMatchersBuilder = path => ( {
  /**
   * Matches a file called steps.js, located at the path
   * @param {string} path - Path to test
   * @returns {boolean}
   */
  stepsFile: v => v === `${path}${sep}steps.js`,
  /**
   * Matches a file called evaluators.js, located at the path
   * @param {string} path - Path to test
   * @returns {boolean}
   */
  evaluatorsFile: v => v === `${path}${sep}evaluators.js`,
  /**
   * Matches all files on any levels inside a folder called steps/, located at the path
   * @param {string} path - Path to test
   * @returns {boolean}
   */
  stepsDir: v => v.startsWith( `${path}${sep}steps${sep}` ),
  /**
   * Matches all files on any levels inside a folder called evaluators/, located at the path
   * @param {string} path - Path to test
   * @returns {boolean}
   */
  evaluatorsDir: v => v.startsWith( `${path}${sep}evaluators${sep}` )
} );

/**
 * Matchers that can be used to access conditions without initializing them
 */
export const staticMatchers = {
  /**
   * Matches a workflow.js file
   * @param {string} path - Path to test
   * @returns {boolean}
   */
  workflowFile: v => v.endsWith( `${sep}workflow.js` ),
  /**
   * Matches a workflow.js that is inside a shared folder: eg foo/shared/workflow.js
   * @param {string} path - Path to test
   * @returns {boolean}
   */
  workflowPathHasShared: v => v.endsWith( `${sep}shared${sep}workflow.js` ),
  /**
   * Matches the shared folder for steps src/shared/steps/../step_file.js
   * @param {string} path - Path to test
   * @returns {boolean}
   */
  sharedStepsDir: v => v.includes( `${sep}shared${sep}steps${sep}` ) && v.endsWith( '.js' ),
  /**
   * Matches the shared folder for evaluators src/shared/evaluators/../evaluator_file.js
   * @param {string} path - Path to test
   * @returns {boolean}
   */
  sharedEvaluatorsDir: v => v.includes( `${sep}shared${sep}evaluators${sep}` ) && v.endsWith( '.js' )
};

/**
 * @typedef {object} File
 * @property {string} path - The file path
 * @property {string} url - The resolved url of the file, ready to be imported
 */
/**
 * @typedef {object} Component
 * @property {Function} fn - The loaded component function
 * @property {object} metadata - Associated metadata with the component
 * @property {string} path - Associated metadata with the component
 */

/**
 * Recursive traverse directories collection files with paths that match one of the given matches.
 *
 * Follows symlinks to directories
 *
 * @param {string} parentPath - The path to scan
 * @param {function[]} matchers - Boolean functions to match files to add to collection
 * @returns {File[]} An array containing the collected files
 */
export const matchFiles = ( parentPath, matchers, ignoreDirNames = [ 'vendor', 'node_modules' ] ) => {
  const collection = [];
  for ( const entry of readdirSync( parentPath, { withFileTypes: true } ) ) {
    if ( ignoreDirNames.includes( entry.name ) ) {
      continue;
    }
    const path = resolve( parentPath, entry.name );
    const realPath = entry.isSymbolicLink() ? resolveSymlink( path ) : path;
    if ( !realPath ) {
      continue;
    }
    const stat = lstatSync( realPath );
    if ( stat.isDirectory() ) {
      collection.push( ...matchFiles( realPath, matchers ) );
    } else if ( stat.isFile() && matchers.some( m => m( realPath ) ) ) {
      collection.push( { path, url: pathToFileURL( realPath ).href } );
    }
  }
  return collection;
};

/**
 * Returns true if given package.json indicates that its workflows are exposed for external usage.
 *
 * @param {string} pkgJsonPath
 * @returns {boolean}
 */
export const packageExposesWorkflows = pkgJsonPath => {
  if ( !existsSync( pkgJsonPath ) ) {
    return false;
  }
  const pkgJsonRawContent = readFileSync( pkgJsonPath );
  try {
    const packageContent = JSON.parse( pkgJsonRawContent );
    return packageContent['outputai']?.workflows?.expose === true;
  } catch {
    return false;
  }
};

/**
 * Normalize path separators for cross-platform path matching.
 *
 * @param {string} path
 * @returns {string}
 */
const normalizeSlashes = path => path.replace( /\\/g, '/' );

/**
 * Returns true if the given path is inside a node_modules tree.
 *
 * @param {string} path
 * @returns {boolean}
 */
export const isPathDescendentFromNodeModules = path =>
  /(^|\/)node_modules(\/|$)/.test( normalizeSlashes( path ) );

/**
 * Returns true if the given path is an installed package root inside node_modules.
 *
 * Matches both unscoped packages and scoped packages.
 *
 * @param {string} path
 * @returns {boolean}
 */
export const isPackageRoot = path =>
  /\/node_modules\/(?:@[^/]+\/[^/]+|[^/@][^/]*)$/.test( normalizeSlashes( path ) );

/**
 * Walk upward from a file path to find the closest installed package root under node_modules.
 *
 * @param {string} path
 * @returns {string|null}
 */
export const findPackageRoot = path => {
  if ( isPackageRoot( path ) && existsSync( resolve( path, 'package.json' ) ) ) {
    return path;
  }
  const parent = dirname( path );
  return parent !== path ? findPackageRoot( parent ) : null;
};

/**
 * Resolves the closest node_modules directory
 *
 * @param {string} targetPath - A reference path to start the search, can be a dir or a file path
 * @returns {string|null} The closest node_modules/ or null
 */
export const resolveNodeModulesPath = targetPath => {
  if ( !existsSync( targetPath ) ) {
    return null;
  }
  const path = lstatSync( targetPath ).isDirectory() ? targetPath : dirname( targetPath );
  const nodeModulesPath = resolve( path, 'node_modules' );
  if ( existsSync( nodeModulesPath ) ) {
    const stat = lstatSync( nodeModulesPath );
    if ( stat.isDirectory() ) {
      return nodeModulesPath;
    }
    if ( stat.isSymbolicLink() ) {
      const symlinkTarget = resolveSymlink( nodeModulesPath );
      if ( symlinkTarget && lstatSync( symlinkTarget ).isDirectory() ) {
        return symlinkTarget;
      }
    }
  }

  const parentPath = resolve( path, '..' );
  return parentPath !== path ? resolveNodeModulesPath( parentPath ) : null;
};

/**
 * Scans a node_modules/ path and look for all projects that contain workflows.
 *
 * A project contains workflows when packageExposesWorkflows() resolves to true.
 *
 * For each of these projects, load workflows using matchFiles().
 *
 * @param {string} nodeModulesPath
 * @returns {File[]} An array containing the collected files
 *
 */
export const findWorkflowsInPackages = nodeModulesPath => {
  const collection = [];
  for ( const entry of readdirSync( nodeModulesPath, { withFileTypes: true } ) ) {
    const path = resolve( nodeModulesPath, entry.name );
    const realPath = entry.isSymbolicLink() ? resolveSymlink( path ) : path;

    if ( realPath && lstatSync( realPath ).isDirectory() ) {
      if ( entry.name.startsWith( '@' ) ) { // scoped package root
        collection.push( ...findWorkflowsInPackages( realPath ) );
      } else if ( packageExposesWorkflows( resolve( realPath, 'package.json' ) ) ) { // is a package folder
        collection.push( ...matchFiles( realPath, [ staticMatchers.workflowFile ] ) );
      }
    }
  }
  return collection;
};

/**
 * Recursive traverse the closest node_modules/ directory loading workflows.
 *
 * Deduplicates by file url.
 *
 * @param {string} parentPath - The starting path
 * @returns {File[]} An array containing the collected files
 */
export const findWorkflowsInNodeModules = parentPath => {
  const nodeModulesPath = resolveNodeModulesPath( parentPath );
  if ( !nodeModulesPath ) {
    return [];
  }
  const collection = findWorkflowsInPackages( nodeModulesPath );

  // deduplicate collection by .url in case symlinked packages end up resolving the same dependencies more than once
  return collection.reduce( ( map, value ) => map.set( value.url, value ), new Map() ).values().toArray();
};

/**
 * Based on workflow urls, traverse those projects looking for shared activities (steps, evaluators).
 *
 * @param {Component[]} workflows
 * @returns {File[]}
 */
export const findSharedActivitiesFromWorkflows = workflows => {
  const paths = workflows.map( wf => findPackageRoot( wf.path ) );
  const uniquePaths = new Set( paths.filter( p => !!p ) ).values().toArray();
  const files = [];
  for ( const path of uniquePaths ) {
    files.push( ...matchFiles( path, [ staticMatchers.sharedStepsDir, staticMatchers.sharedEvaluatorsDir ] ) );
  }
  return files;
};

/**
 * Receives an array of Files and import each one.
 *
 * For each exported function from that file that has metadata, yields the path, metadata and the function itself.
 *
 * metadata is accessible thru METADATA_ACCESS_SYMBOL.
 *
 * @generator
 * @async
 * @function importComponents
 * @param {File} Files - Collected files to load
 * @yields {Component}
 */
export async function *importComponents( files ) {
  for ( const { url, path } of files ) {
    const imported = await import( url );
    for ( const fn of Object.values( imported ) ) {
      const metadata = fn[METADATA_ACCESS_SYMBOL];
      if ( !metadata ) {
        continue;
      }
      yield { fn, metadata, path };
    }
  }
};

/**
 * Creates a hash of all source code in a given dir
 *
 * @param {string} rootDir
 * @returns {string} Hash value
 */
export const hashSourceCode = async rootDir => {
  try {
    const { hash } = await hashElement( rootDir, {
      folders: {
        exclude: [ '.*', 'node_modules', 'test_coverage', 'vendor', 'test' ],
        ignoreRootName: true
      },
      files: {
        include: [ '*.js', '*.cjs', '*.mjs', '*.ts', '*.yaml', '*.yml', '*.json', '*.prompt' ],
        ignoreRootName: true
      }
    } );
    return hash;
  } catch ( error ) {
    throw new Error( `Error calculating hash from "${error}": ${error.message}`, { cause: error } );
  }
};
