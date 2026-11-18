import { readFileSync } from 'node:fs';

export function parseInputFlag( input: string ): unknown {
  try {
    return JSON.parse( input );
  } catch {
    try {
      const fileContent = readFileSync( input, 'utf-8' );
      return JSON.parse( fileContent );
    } catch ( error ) {
      const err = error as NodeJS.ErrnoException;
      if ( err.code === 'ENOENT' ) {
        throw new Error( `Input file not found: ${input}` );
      }
      throw new Error( `Invalid JSON input: ${err.message}` );
    }
  }
}
