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
