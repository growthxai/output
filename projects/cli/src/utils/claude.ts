import { spawnSync } from 'node:child_process';
import { executeCommand } from './process.js';

export interface ExecuteClaudeCommandOptions {
  ignoreFailure?: boolean;
}

export function isClaudeCliAvailable(): boolean {
  const result = spawnSync( 'claude', [ '--version' ], { encoding: 'utf8' } );
  return result.status === 0;
}

export async function executeClaudeCommand(
  args: string[],
  cwd: string,
  options?: ExecuteClaudeCommandOptions
): Promise<void> {
  if ( !isClaudeCliAvailable() ) {
    throw new Error(
      'Claude CLI not found. Please install Claude Code CLI and ensure \'claude\' is in your PATH.'
    );
  }

  try {
    await executeCommand( 'claude', args, cwd );
  } catch ( error ) {
    if ( !options?.ignoreFailure ) {
      throw error;
    }
  }
}
