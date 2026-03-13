/**
 * Configuration for HTTP client behavior
 */
export const config = {
  /**
   * Whether to log verbose HTTP information (headers and bodies)
   * Controlled by OUTPUT_TRACE_HTTP_VERBOSE environment variable
   */
  logVerbose: [ '1', 'true' ].includes( process.env.OUTPUT_TRACE_HTTP_VERBOSE as string )
};
