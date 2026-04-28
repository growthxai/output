import { InvalidNameError, InvalidOutputDirectoryError } from '#types/errors.js';

/**
 * Validate workflow name format
 * Must contain only letters, numbers, hyphens, and underscores
 */
export function isValidWorkflowName( name: string ): boolean {
  // Must start with a letter or underscore, followed by letters, numbers, hyphens, or underscores
  return /^[a-z_][a-z0-9_-]*$/i.test( name );
}

/**
 * Validate workflow name and throw descriptive error if invalid
 */
export function validateWorkflowName( name: string ): void {
  if ( !isValidWorkflowName( name ) ) {
    throw new InvalidNameError( name );
  }
}

/**
 * Validate that a directory path is safe to create
 */
export function validateOutputDirectory( outputDir: string ): void {
  if ( !outputDir || outputDir.trim() === '' ) {
    throw new InvalidOutputDirectoryError( outputDir, 'Output directory cannot be empty' );
  }
}

const MIN_PORT = 1;
const MAX_PORT = 65535;

export class InvalidPortError extends Error {
  constructor( envVarName: string, raw: string, reason: string ) {
    super(
      `${envVarName}=${raw} is invalid (${reason}). ` +
      `Set a port in ${MIN_PORT}-${MAX_PORT} in your .env file, or unset the variable to use the default.`
    );
    this.name = 'InvalidPortError';
  }
}

/**
 * Parse a port number from an env var. Empty string and undefined fall back to
 * the default silently (matching Compose's `${VAR:-default}` semantics).
 * Throws InvalidPortError on anything other than a positive integer literal in
 * range 1-65535. Throwing (vs warn-and-fallback) prevents CLI/Docker
 * disagreement: Compose reads the same env var via `${VAR:-default}` and uses
 * its own parser, so a CLI fallback would silently desync from the bound port.
 */
export function parsePort(
  raw: string | undefined,
  defaultPort: number,
  envVarName: string
): number {
  if ( raw === undefined || raw === '' ) {
    return defaultPort;
  }

  if ( !/^\d+$/.test( raw ) ) {
    throw new InvalidPortError( envVarName, raw, 'not a positive integer' );
  }

  const n = parseInt( raw, 10 );
  if ( n < MIN_PORT || n > MAX_PORT ) {
    throw new InvalidPortError( envVarName, raw, `out of range ${MIN_PORT}-${MAX_PORT}` );
  }

  return n;
}
