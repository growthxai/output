import { ux } from '@oclif/core';
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

/**
 * Parse a port number from an env var. Empty string and undefined fall back to
 * the default silently (matching Compose's `${VAR:-default}` semantics).
 * Invalid values (non-integer, out of range, trailing junk) emit a warning
 * via ux.warn and fall back to the default so the dev stack still starts.
 */
export function parsePort(
  raw: string | undefined,
  defaultPort: number,
  envVarName?: string
): number {
  if ( raw === undefined || raw === '' ) {
    return defaultPort;
  }

  if ( !/^\d+$/.test( raw ) ) {
    const label = envVarName ? `${envVarName}=${raw}` : `port "${raw}"`;
    ux.warn( `Invalid ${label} - falling back to default ${defaultPort}` );
    return defaultPort;
  }

  const n = parseInt( raw, 10 );
  if ( n < MIN_PORT || n > MAX_PORT ) {
    const label = envVarName ? `${envVarName}=${raw}` : `port ${raw}`;
    ux.warn( `${label} is out of range (${MIN_PORT}-${MAX_PORT}) - falling back to default ${defaultPort}` );
    return defaultPort;
  }

  return n;
}
