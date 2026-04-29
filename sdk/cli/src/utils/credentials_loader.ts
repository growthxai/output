import { MissingKeyError, resolveCredentialRefs } from '@outputai/credentials';

export const loadCredentialRefs = (): void => {
  try {
    resolveCredentialRefs();
  } catch ( error: unknown ) {
    if ( error instanceof MissingKeyError ) {
      console.error( `Error: ${error.message}` );
      process.exit( 1 );
    } else {
      throw error;
    }
  }
};
