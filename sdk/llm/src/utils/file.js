import { join } from 'path';
import { readdirSync, readFileSync } from 'node:fs';
import { FatalError } from '@outputai/core';

const scanDir = dir => {
  try {
    return readdirSync( dir, { withFileTypes: true } );
  } catch ( error ) {
    throw new FatalError( `Error scanning directory "${dir}"`, { cause: error } );
  }
};

const readFile = path => {
  try {
    return readFileSync( path, 'utf-8' );
  } catch ( error ) {
    throw new FatalError( `Error reading file "${path}"`, { cause: error } );
  }
};

/**
 * Recursively search for a file by name and return both its content and containing directory.
 *
 * @param {string} dir - Directory to search
 * @param {string} name - File name to find
 * @returns {{ content: string, dir: string } | null}
 */
export const searchAndReadFile = ( dir, name ) => {
  for ( const entry of scanDir( dir ) ) {
    const path = join( dir, entry.name );
    if ( entry.name === name ) {
      return { dir, content: readFile( path ) };
    }
    if ( entry.isDirectory() && !entry.isSymbolicLink() ) {
      const result = searchAndReadFile( path, name );
      if ( result ) {
        return result;
      }
    }
  }
  return null;
};
