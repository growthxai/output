import fs from 'node:fs';
import { FolderAlreadyExistsError } from '#types/errors.js';
import { getErrorCode, getErrorMessage } from './error_utils.js';

export function directoryExists( dirPath: string ): boolean {
  try {
    fs.accessSync( dirPath );
    return true;
  } catch ( error ) {
    if ( getErrorCode( error ) === 'ENOENT' ) {
      return false;
    }
    throw error;
  }
}

export function createDirectory( dirPath: string ): void {
  const exists = directoryExists( dirPath );

  if ( exists ) {
    throw new FolderAlreadyExistsError( dirPath );
  }

  fs.mkdirSync( dirPath, { recursive: true } );
}

export function removeDirectory(
  dirPath: string,
  onError?: ( message: string ) => void
): void {
  try {
    fs.rmSync( dirPath, { recursive: true, force: true } );
  } catch ( error: unknown ) {
    const message = getErrorMessage( error );
    if ( onError ) {
      onError( `Failed to cleanup folder: ${message}` );
    }
  }
}
