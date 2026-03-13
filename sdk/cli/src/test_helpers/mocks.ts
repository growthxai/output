/**
 * Shared test mocks for workflow plan command
 */
import { vi } from 'vitest';
import type { Mock } from 'vitest';

/**
 * Mock for @anthropic-ai/claude-agent-sdk
 */
export const mockClaudeAgentSDK: {
  Agent: Mock;
} = {
  Agent: vi.fn().mockImplementation( () => ( {
    execute: vi.fn().mockResolvedValue( {
      output: 'Mock plan output from claude-code'
    } )
  } ) )
};

/**
 * Mock for @outputai/llm
 */
export const mockLLM: {
  generateText: Mock;
} = {
  generateText: vi.fn().mockResolvedValue( {
    text: 'workflow_plan_name',
    sources: [],
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    finishReason: 'stop'
  } )
};

/**
 * Mock for child_process spawn (for agent commands)
 */
export const mockSpawn: Mock = vi.fn().mockImplementation( () => {
  const mockChild = {
    on: vi.fn( ( event: string, callback: ( code: number ) => void ) => {
      if ( event === 'close' ) {
        // Simulate successful process exit
        setTimeout( () => callback( 0 ), 0 );
      }
      return mockChild;
    } )
  };
  return mockChild;
} );

/**
 * Mock for fs/promises
 */
export const mockFS: {
  access: Mock;
  mkdir: Mock;
  writeFile: Mock;
  readFile: Mock;
  stat: Mock;
} = {
  access: vi.fn().mockRejectedValue( { code: 'ENOENT' } ), // Default: file doesn't exist
  mkdir: vi.fn().mockResolvedValue( undefined ),
  writeFile: vi.fn().mockResolvedValue( undefined ),
  readFile: vi.fn().mockResolvedValue( 'template content' ),
  stat: vi.fn().mockRejectedValue( { code: 'ENOENT' } )
};

/**
 * Mock for @inquirer/prompts
 */
export const mockInquirer: {
  input: Mock;
  confirm: Mock;
} = {
  input: vi.fn().mockResolvedValue( 'Mock workflow description' ),
  confirm: vi.fn().mockResolvedValue( true )
};

/**
 * Reset all mocks
 */
export function resetAllMocks() {
  vi.clearAllMocks();

  // Reset mock implementations to defaults
  mockFS.access.mockRejectedValue( { code: 'ENOENT' } );
  mockFS.mkdir.mockResolvedValue( undefined );
  mockFS.writeFile.mockResolvedValue( undefined );
  mockFS.readFile.mockResolvedValue( 'template content' );
  mockFS.stat.mockRejectedValue( { code: 'ENOENT' } );

  mockLLM.generateText.mockResolvedValue( {
    text: 'workflow_plan_name',
    sources: [],
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    finishReason: 'stop'
  } );
  mockInquirer.input.mockResolvedValue( 'Mock workflow description' );
  mockInquirer.confirm.mockResolvedValue( true );
}
