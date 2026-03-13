/**
 * Sensitive header patterns for redaction (case-insensitive)
 */
const SENSITIVE_HEADER_PATTERNS = [
  /authorization/i,
  /token/i,
  /api-?key/i,
  /secret/i,
  /password/i,
  /pwd/i,
  /key/i,
  /cookie/i
] as const;

/**
 * Redacts sensitive headers for safe logging
 * @param headers - Headers object to redact
 * @returns Object with sensitive headers redacted
 */
export default function redactHeaders( headers: Record<string, string> | Headers ): Record<string, string> {
  const result: Record<string, string> = {};

  const entries = headers instanceof Headers ? headers.entries() : Object.entries( headers );

  for ( const [ key, value ] of entries ) {
    const isSensitive = SENSITIVE_HEADER_PATTERNS.some( pattern => pattern.test( key ) );
    result[key] = isSensitive ? '[REDACTED]' : value;
  }

  return result;
}
