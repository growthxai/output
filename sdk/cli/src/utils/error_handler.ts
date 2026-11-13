import type { Command } from '@oclif/core';
import { CLIError, ExitError } from '@oclif/core/errors';
import { ux } from '@oclif/core/ux';
import { config } from '#config.js';

interface ApiError extends Error {
  code?: string;
  response?: {
    status: number;
    data?: unknown;
  };
}

type ErrorOptions = {
  exit: number;
  status?: number;
  code?: string;
  original?: CLIError;
};

type ErrorFn = ( message: string, options: ErrorOptions ) => never;

type ErrorOverrides = {
  [statusCode: number]: string;
  ECONNREFUSED?: string;
};

function getDefaultMessages() {
  return {
    ECONNREFUSED: `Connection refused to ${config.apiUrl}. Is the API server running?`,
    401: 'Authentication failed. Check your OUTPUT_API_AUTH_TOKEN.',
    404: 'Resource not found.',
    500: 'Server error.',
    UNKNOWN: 'An unknown error occurred.'
  };
}

interface ApiErrorData {
  error?: string;
  message?: string;
  rootCause?: {
    error: string;
    message: string;
  };
}

/**
 * Extract error type and message from API response data
 */
function extractApiErrorDetails( data: unknown ): { errorType: string; errorMsg: string } | null {
  const errorData = data as ApiErrorData;
  if ( !errorData?.error && !errorData?.message ) {
    return null;
  }

  const errorType = errorData.error || 'Error';
  const baseMsg = errorData.message || 'Unknown error';
  const rootCauseLine = errorData.rootCause ?
    `\n${errorData.rootCause.error}: ${errorData.rootCause.message}` :
    '';

  return { errorType, errorMsg: `${baseMsg}.${rootCauseLine}` };
}

/**
 * Extract detailed error information from fetch errors and their causes
 */
function getDetailedErrorMessage( error: unknown ): string {
  const apiError = error as ApiError & { cause?: Error };

  const parts: string[] = [];

  if ( apiError.message ) {
    parts.push( apiError.message );
  }

  if ( apiError.cause ) {
    const cause = apiError.cause as Error & { code?: string; hostname?: string; port?: number };
    if ( cause.message && cause.message !== apiError.message ) {
      parts.push( `Cause: ${cause.message}` );
    }
    if ( cause.code ) {
      parts.push( `Code: ${cause.code}` );
    }
    if ( cause.hostname ) {
      parts.push( `Host: ${cause.hostname}${cause.port ? ':' + cause.port : ''}` );
    }
  }

  if ( apiError.response?.status ) {
    parts.push( `HTTP Status: ${apiError.response.status}` );
  }

  return parts.length > 0 ? parts.join( ' | ' ) : 'Unknown error';
}

/**
 * Builds the `errorFn` a `--json` capable command hands to `handleApiError` and `handleCommandError`.
 * In text mode it fails through `command.error()`, or rethrows the original oclif error when one is given.
 * Under `--json` it writes `{ error: { message, status?, code? } }` to stderr and throws an `ExitError`, which
 * oclif exits on without printing anything else. Stdout stays reserved for results, so it is empty on failure and
 * the exit code says which. `command.error()` alone cannot do this: it only throws a plain-text error, and oclif's
 * own JSON error handling lives in its default `catch()`, which the commands override.
 *
 * @param command - The command whose `catch()` reports the error
 * @returns The error reporter
 */
export function createErrorFn( command: Command ): ErrorFn {
  return ( message, { exit, status, code, original } ) => {
    if ( !command.jsonEnabled() ) {
      if ( original ) {
        throw original;
      }
      return command.error( message, { exit } );
    }

    ux.stderr( JSON.stringify( {
      error: {
        message,
        ...( status === undefined ? {} : { status } ),
        ...( code === undefined ? {} : { code } )
      }
    }, null, 2 ) );
    throw new ExitError( exit );
  };
}

export function handleApiError(
  error: unknown,
  errorFn: ErrorFn,
  overrides: ErrorOverrides = {}
): never {
  const apiError = error as ApiError & { cause?: Error & { code?: string } };
  const errorMessages = { ...getDefaultMessages(), ...overrides };
  const status = apiError.response?.status;
  const code = apiError.code ?? apiError.cause?.code;
  const fail = ( message: string ): never => errorFn( message, { exit: 1, status, code } );

  if ( apiError.code === 'ECONNREFUSED' || apiError.cause?.code === 'ECONNREFUSED' ) {
    fail( errorMessages.ECONNREFUSED );
  }

  if ( status ) {
    // A caller-supplied override for this exact status wins over the raw server body. The API's
    // 404 body is a bare "WorkflowNotFoundError: ..." that the friendly override is meant to
    // replace; without this, extractApiErrorDetails consumes the body first and every command's
    // per-status override is dead code. Defaults are not consulted here, so commands that pass no
    // override still get the rich server detail below.
    if ( status in overrides ) {
      fail( overrides[status as keyof ErrorOverrides] as string );
    }

    // Extract error details from response body
    const apiErrorDetails = extractApiErrorDetails( apiError.response?.data );
    if ( apiErrorDetails ) {
      const { errorType, errorMsg } = apiErrorDetails;
      fail( `${errorType}: ${errorMsg}` );
    }

    const message = errorMessages[status as keyof typeof errorMessages];
    if ( message ) {
      fail( message );
    }
  }

  return fail( getDetailedErrorMessage( error ) );
}

/**
 * `catch()` handling for a command that raises oclif errors of its own. Flag
 * relationship failures and every `this.error( ..., { exit } )` already carry an
 * exit code and formatted output, and `handleApiError` would flatten all of it
 * to a bare exit 1 - so hand those to `errorFn` with their own exit code and the
 * original error, and only map what actually came back from the API.
 */
export function handleCommandError(
  error: Error,
  errorFn: ErrorFn,
  overrides: ErrorOverrides = {}
): never {
  if ( error instanceof CLIError ) {
    const exit = typeof error.oclif?.exit === 'number' ? error.oclif.exit : 1;
    return errorFn( error.message, { exit, original: error } );
  }
  return handleApiError( error, errorFn, overrides );
}
