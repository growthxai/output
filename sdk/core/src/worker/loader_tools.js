import { resolve, sep } from 'path';
import { pathToFileURL } from 'url';
import { METADATA_ACCESS_SYMBOL } from '#consts';
import { readdirSync } from 'fs';

/**
 * @typedef {object} CollectedFile
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
 * @param {string} path - The path to scan
 * @param {function[]} matchers - Boolean functions to match files to add to collection
 * @returns {CollectedFile[]} An array containing the collected files
 */
const findByNameRecursively = ( parentPath, matchers, ignoreDirNames = [ 'vendor', 'node_modules' ] ) => {
  const collection = [];
  for ( const entry of readdirSync( parentPath, { withFileTypes: true } ) ) {
    if ( ignoreDirNames.includes( entry.name ) ) {
      continue;
    }

    const path = resolve( parentPath, entry.name );
    if ( entry.isDirectory() ) {
      collection.push( ...findByNameRecursively( path, matchers ) );
    } else if ( matchers.some( m => m( path ) ) ) {
      collection.push( { path, url: pathToFileURL( path ).href } );
    }
  }

  return collection;
};

/**
 * Scan a path for files testing each path against a matching function.
 *
 * For each file found, dynamic import it and for each exports on that file, yields it.
 *
 * @remarks
 * - Only yields exports that have the METADATA_ACCESS_SYMBOL, as they are output components (steps, evaluators, etc).
 *
 * @generator
 * @async
 * @function importComponents
 * @param {string} target - Place to look for files
 * @param {function[]} matchers - Boolean functions to match files
 * @yields {Component}
 */
export async function *importComponents( target, matchers ) {
  for ( const { url, path } of findByNameRecursively( target, matchers ) ) {
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
