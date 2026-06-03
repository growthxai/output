import { join } from 'path';
import { readdirSync, readFileSync } from 'node:fs';
import { resolveInvocationDir } from '@outputai/core/sdk_utils';
import { FatalError } from '@outputai/core';

const scanDir = dir => {
  try {
    return readdirSync( dir, { withFileTypes: true } );
  } catch ( error ) {
    throw new FatalError( `Error scanning directory "${dir}"`, { cause: error } );
  }
};

const loadFile = path => {
  try {
    return readFileSync( path, 'utf-8' );
  } catch ( error ) {
    throw new FatalError( `Error reading file "${path}"`, { cause: error } );
  }
};

const findContent = ( name, dir ) => {
  for ( const entry of scanDir( dir ) ) {
    if ( entry.name === name ) {
      return { dir, content: loadFile( join( dir, entry.name ) ) };
    }
    if ( entry.isDirectory() && !entry.isSymbolicLink() ) {
      const result = findContent( name, join( dir, entry.name ) );
      if ( result ) {
        return result;
      }
    }
  }
  return null;
};

/**
 * Recursively search for a file by name and return both its content and containing directory.
 *
 * @param {string} name - File name to find
 * @param {string} [dir] - Directory to search, defaults to invocation directory
 * @returns {{ content: string, dir: string } | null}
 */
export const loadContent = ( name, dir = resolveInvocationDir() ) =>
  findContent( name, dir ) ?? null;
