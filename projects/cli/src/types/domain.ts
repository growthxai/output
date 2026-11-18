/**
 * Domain-specific types for improved type safety
 */

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export type FileMappingType = 'template' | 'symlink' | 'copy';

export interface Todo {
  content: string;
  activeForm: string;
  status: TodoStatus;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SystemValidation {
  missingCommands: string[];
  hasIssues: boolean;
}
