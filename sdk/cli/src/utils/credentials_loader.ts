import {
  InvalidCredentialsKeyError,
  MalformedCredentialsKeyError,
  MissingKeyError,
  resolveCredentialRefs
} from '@outputai/credentials';

const isCredentialsConfigError = ( error: unknown ): error is Error =>
  error instanceof MissingKeyError ||
  error instanceof InvalidCredentialsKeyError ||
  error instanceof MalformedCredentialsKeyError;

export const loadCredentialRefs = (): void => {
  try {
    resolveCredentialRefs();
  } catch ( error: unknown ) {
    if ( isCredentialsConfigError( error ) ) {
      console.error( `Error: ${error.message}` );
      process.exit( 1 );
    } else {
      throw error;
    }
  }
};
