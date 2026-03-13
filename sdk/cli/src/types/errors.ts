/**
 * Error thrown when a workflow already exists
 */
export class WorkflowExistsError extends Error {
  constructor( workflowName: string, targetPath: string ) {
    super( `Workflow "${workflowName}" already exists at ${targetPath}. Use --force to overwrite.` );
  }
}

/**
 * Error thrown when workflow name is invalid
 */
export class InvalidNameError extends Error {
  constructor( name: string ) {
    super( `Invalid workflow name "${name}". Name must contain only letters, numbers, hyphens, and underscores.` );
  }
}

/**
 * Error thrown when template file is not found
 */
export class TemplateNotFoundError extends Error {
  constructor( templateFile: string ) {
    super( `Template file "${templateFile}" not found. Please ensure CLI is properly installed.` );
  }
}

/**
 * Error thrown when output directory is invalid or inaccessible
 */
export class InvalidOutputDirectoryError extends Error {
  constructor( outputDir: string, reason?: string ) {
    const message = reason ?
      `Invalid output directory "${outputDir}": ${reason}` :
      `Invalid output directory "${outputDir}"`;
    super( message );
  }
}

/**
 * Error thrown when folder already exists during initialization
 */
export class FolderAlreadyExistsError extends Error {
  folderPath: string;

  constructor( folderPath: string ) {
    super( `Folder already exists: ${folderPath}` );
    this.folderPath = folderPath;
  }
}

/**
 * Error thrown when user cancels initialization
 */
export class UserCancelledError extends Error {
  constructor() {
    super( 'Init cancelled by user.' );
  }
}

/**
 * Type-safe error wrapper that preserves original error with context
 */
export class ProjectInitError extends Error {
  constructor(
    message: string,
    public readonly originalError: Error,
    public readonly projectPath: string | null = null
  ) {
    super( message );
    // Preserve original stack trace
    if ( originalError.stack ) {
      this.stack = originalError.stack;
    }
  }
}

/**
 * Error thrown when directory creation fails with project context
 */
export class DirectoryCreationError extends Error {
  /**
   * @param message - The error message
   * @param projectPath - The path where directory creation failed
   */
  constructor(
    message: string,
    public readonly projectPath: string
  ) {
    super( message );
  }
}

/**
 * Error thrown when a Claude CLI plugin command fails
 */
export class ClaudePluginError extends Error {
  /**
   * @param commandName - The Claude command that failed (e.g., 'plugin update outputai')
   * @param originalError - The underlying error from the command execution
   */
  constructor(
    public readonly commandName: string,
    public readonly originalError?: Error
  ) {
    const originalMessage = originalError?.message || 'Unknown error';
    super( `Claude command '${commandName}' failed: ${originalMessage}` );
  }
}
