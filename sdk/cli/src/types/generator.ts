/**
 * Configuration for workflow generation
 */
export interface WorkflowGenerationConfig {
  name: string;
  description?: string;
  outputDir: string;
  skeleton: boolean;
  force: boolean;
}

/**
 * Result of workflow generation
 */
export interface WorkflowGenerationResult {
  workflowName: string;
  targetDir: string;
  filesCreated: string[];
}

/**
 * Template file information
 */
export interface TemplateFile {
  name: string;
  path: string;
  outputName: string;
}
