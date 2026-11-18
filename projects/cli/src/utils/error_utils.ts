/**
 * Type guard to check if an unknown value is an Error object
 */
export function isError( error: unknown ): error is Error {
  return (
    error instanceof Error ||
    ( typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof ( error as Record<string, unknown> ).message === 'string' )
  );
}

/**
 * Type guard to check if an error is a Node.js system error
 */
export function isNodeError( error: unknown ): error is NodeJS.ErrnoException {
  return isError( error ) && 'code' in error;
}

/**
 * Safely extract an error message from an unknown error type
 */
export function getErrorMessage( error: unknown ): string {
  if ( isError( error ) ) {
    return error.message;
  }

  if ( typeof error === 'string' ) {
    return error;
  }

  // Handle objects with a code property (like Node.js errors)
  if ( error && typeof error === 'object' && 'code' in error ) {
    const errorObj = error as { code?: string; message?: string };
    if ( errorObj.message ) {
      return errorObj.message;
    }
    if ( errorObj.code ) {
      return `Error: ${errorObj.code}`;
    }
  }

  // Handle objects with a custom toString
  if ( error && typeof error === 'object' && 'toString' in error ) {
    const str = String( error );
    // Avoid returning '[object Object]'
    if ( str !== '[object Object]' ) {
      return str;
    }
  }

  // Try to extract any useful information from the object
  if ( error && typeof error === 'object' ) {
    try {
      const json = JSON.stringify( error );
      if ( json && json !== '{}' ) {
        return `Error: ${json}`;
      }
    } catch {
      // Ignore circular reference errors
    }
  }

  return 'An unknown error occurred';
}

/**
 * Safely extract an error code from a Node.js error
 */
export function getErrorCode( error: unknown ): string | undefined {
  // Check if it's a proper Node.js error with a code
  if ( isNodeError( error ) ) {
    return error.code;
  }

  // Also handle plain objects with a code property (like mocked errors in tests)
  return error && typeof error === 'object' && 'code' in error ?
    ( error as { code?: string } ).code :
    undefined;
}

/**
 * Convert an unknown error to a proper Error object
 */
export function toError( error: unknown ): Error {
  if ( isError( error ) ) {
    return error;
  }

  return new Error( getErrorMessage( error ) );
}

/**
 * Create a formatted error message with optional context
 */
export function formatError( error: unknown, context?: string ): string {
  const message = getErrorMessage( error );
  return context ? `${context}: ${message}` : message;
}
