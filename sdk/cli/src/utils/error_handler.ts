import { config } from '#config.js';

interface ApiError extends Error {
  code?: string;
  response?: {
    status: number;
    data?: unknown;
  };
}

type ErrorOverrides = {
  [statusCode: number]: string;
  ECONNREFUSED?: string;
};

const DEFAULT_MESSAGES = {
  ECONNREFUSED: `Connection refused to ${config.apiUrl}. Is the API server running?`,
  401: 'Authentication failed. Check your OUTPUT_API_AUTH_TOKEN.',
  404: 'Resource not found.',
  500: 'Server error.',
  UNKNOWN: 'An unknown error occurred.'
};

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

export function handleApiError(
  error: unknown,
  errorFn: ( ...args: [ message: string, options: { exit: number } ] ) => never,
  overrides: ErrorOverrides = {}
): never {
  const apiError = error as ApiError & { cause?: Error & { code?: string } };
  const errorMessages = { ...DEFAULT_MESSAGES, ...overrides };

  if ( apiError.code === 'ECONNREFUSED' || apiError.cause?.code === 'ECONNREFUSED' ) {
    errorFn( errorMessages.ECONNREFUSED, { exit: 1 } );
  }

  if ( apiError.response?.status ) {
    const status = apiError.response.status;

    // Extract error details from response body
    const apiErrorDetails = extractApiErrorDetails( apiError.response.data );
    if ( apiErrorDetails ) {
      const { errorType, errorMsg } = apiErrorDetails;
      errorFn( `${errorType}: ${errorMsg}`, { exit: 1 } );
    }

    const message = errorMessages[status as keyof typeof errorMessages];
    if ( message ) {
      errorFn( message, { exit: 1 } );
    }
  }

  const detailedMessage = getDetailedErrorMessage( error );
  errorFn( detailedMessage, { exit: 1 } );
}
