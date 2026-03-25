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

/**
 * Recursively search for a file by its name and load its content.
 *
 * @param {string} name - Name of the file load its content
 * @param {string} [dir] - The directory to search for the file, defaults to invocation directory
 * @returns {string | null} - File content or null if not found
 */
export const loadContent = ( name, dir = resolveInvocationDir() ) => {
  for ( const entry of scanDir( dir ) ) {
    if ( entry.name === name ) {
      return loadFile( join( dir, entry.name ) );
    }

    if ( entry.isDirectory() && !entry.isSymbolicLink() ) {
      const content = loadContent( name, join( dir, entry.name ) );
      if ( content ) {
        return content;
      }
    }
  }
  return null;
};

/**
 * Recursively search for a file by name and return the directory containing it.
 *
 * @param {string} name - File name to find
 * @param {string} [dir] - Directory to search, defaults to invocation directory
 * @returns {string | null} - Directory path containing the file, or null if not found
 */
export const findContentDir = ( name, dir = resolveInvocationDir() ) => {
  for ( const entry of scanDir( dir ) ) {
    if ( entry.name === name ) {
      return dir;
    }
    if ( entry.isDirectory() && !entry.isSymbolicLink() ) {
      const result = findContentDir( name, join( dir, entry.name ) );
      if ( result ) {
        return result;
      }
    }
  }
  return null;
};
