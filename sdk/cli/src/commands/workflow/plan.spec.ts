import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Config } from '@oclif/core';
import WorkflowPlan from './plan.js';
import { generatePlanName, writePlanFile, updateAgentTemplates } from '#services/workflow_planner.js';
import { ensureOutputAISystem } from '#services/coding_agents.js';
import { invokePlanWorkflow, replyToClaude, ClaudeInvocationError } from '#services/claude_client.js';
import { input } from '#utils/prompt.js';

vi.mock( '#services/workflow_planner.js' );
vi.mock( '#services/coding_agents.js' );
vi.mock( '#services/claude_client.js' );
vi.mock( '#utils/prompt.js' );
vi.mock( '#utils/interactive.js', () => ( { isInteractive: () => true } ) );

type MockedCommand = WorkflowPlan & {
  parse: ReturnType<typeof vi.fn>;
};

describe( 'WorkflowPlan Command', () => {
  const createCommand = (): MockedCommand => {
    const cmd = new WorkflowPlan( [], {} as Config );
    cmd.log = vi.fn();
    cmd.warn = vi.fn();
    cmd.error = vi.fn() as never;
    const mockedCmd = cmd as unknown as MockedCommand;
    mockedCmd.parse = vi.fn() as MockedCommand['parse'];
    return mockedCmd;
  };

  const setupSuccessfulMocks = ( description: string, planName: string, planContent: string ) => {
    // Mock input to return description first, then 'ACCEPT' to stop the modification loop
    const state = { inputCallCount: 0 };
    vi.mocked( input ).mockImplementation( ( async () => {
      state.inputCallCount++;
      if ( state.inputCallCount === 1 ) {
        return description;
      }
      return 'ACCEPT'; // Always accept on second call to stop recursion
    } ) as never );

    vi.mocked( ensureOutputAISystem ).mockResolvedValue();
    vi.mocked( generatePlanName ).mockResolvedValue( planName );
    vi.mocked( invokePlanWorkflow ).mockResolvedValue( planContent );
    vi.mocked( replyToClaude ).mockResolvedValue( planContent );
    vi.mocked( writePlanFile ).mockResolvedValue( `/project/.outputai/plans/${planName}/PLAN.md` );
  };

  beforeEach( () => {
    vi.clearAllMocks();
  } );

  afterEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'command metadata', () => {
    it( 'should have correct description', () => {
      expect( WorkflowPlan.description ).toBeDefined();
      expect( WorkflowPlan.description ).toContain( 'workflow' );
      expect( WorkflowPlan.description ).toContain( 'plan' );
    } );

    it( 'should have examples', () => {
      expect( WorkflowPlan.examples ).toBeDefined();
      expect( Array.isArray( WorkflowPlan.examples ) ).toBe( true );
      expect( WorkflowPlan.examples.length ).toBeGreaterThan( 0 );
    } );

    it( 'should define force-agent-file-write flag', () => {
      expect( WorkflowPlan.flags ).toBeDefined();
      expect( WorkflowPlan.flags['force-agent-file-write'] ).toBeDefined();
      expect( WorkflowPlan.flags['force-agent-file-write'].type ).toBe( 'boolean' );
    } );

    it( 'should have force flag default to false', () => {
      expect( WorkflowPlan.flags['force-agent-file-write'].default ).toBe( false );
    } );
  } );

  describe( 'successful execution flow', () => {
    it( 'should execute complete workflow', async () => {
      const command = createCommand();

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': false }
      } );

      setupSuccessfulMocks(
        'Build a user authentication system',
        '2025_10_06_user_authentication',
        '# Workflow Plan\n\nPlan content here'
      );

      await command.run();

      expect( ensureOutputAISystem ).toHaveBeenCalled();
      expect( generatePlanName ).toHaveBeenCalledWith( 'Build a user authentication system' );
      expect( invokePlanWorkflow ).toHaveBeenCalledWith( 'Build a user authentication system' );
      expect( writePlanFile ).toHaveBeenCalledWith(
        '2025_10_06_user_authentication',
        '# Workflow Plan\n\nPlan content here',
        expect.any( String )
      );
    } );

    it( 'should update templates when force flag is true', async () => {
      const command = createCommand();

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': true }
      } );

      setupSuccessfulMocks( 'Test workflow description', '2025_10_06_test', '# Plan' );
      vi.mocked( updateAgentTemplates ).mockResolvedValue();

      await command.run();

      expect( updateAgentTemplates ).toHaveBeenCalled();
    } );
  } );

  describe( 'user input validation', () => {
    it( 'should validate description is at least 10 characters', async () => {
      const command = createCommand();

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': false }
      } );

      const state = { callCount: 0 };
      const inputMock = vi.fn().mockImplementation( async config => {
        state.callCount++;
        if ( state.callCount === 1 && config.validate ) {
          const shortResult = config.validate( 'short' );
          expect( shortResult ).toBe( false );

          const validResult = config.validate( 'This is a valid description' );
          expect( validResult ).toBe( true );
          return 'Valid description here';
        }
        return 'ACCEPT'; // Second call from modification loop
      } );
      vi.mocked( input ).mockImplementation( inputMock );
      vi.mocked( ensureOutputAISystem ).mockResolvedValue();
      vi.mocked( generatePlanName ).mockResolvedValue( '2025_10_06_test' );
      vi.mocked( invokePlanWorkflow ).mockResolvedValue( '# Plan' );
      vi.mocked( replyToClaude ).mockResolvedValue( '# Plan' );
      vi.mocked( writePlanFile ).mockResolvedValue( '/test/PLAN.md' );

      await command.run();

      expect( inputMock ).toHaveBeenCalled();
    } );
  } );

  describe( 'error handling', () => {
    it( 'should handle missing ANTHROPIC_API_KEY', async () => {
      const command = createCommand();

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': false }
      } );

      vi.mocked( ensureOutputAISystem ).mockResolvedValue();
      vi.mocked( input ).mockResolvedValue( 'Test workflow' );
      vi.mocked( generatePlanName ).mockResolvedValue( '2025_10_06_test' );
      vi.mocked( invokePlanWorkflow ).mockRejectedValue(
        new Error( 'ANTHROPIC_API_KEY environment variable is required' )
      );

      await expect( command.run() ).rejects.toThrow( /ANTHROPIC_API_KEY/i );
    } );

    it( 'should handle Claude SDK errors gracefully', async () => {
      const command = createCommand();

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': false }
      } );

      vi.mocked( ensureOutputAISystem ).mockResolvedValue();
      vi.mocked( input ).mockResolvedValue( 'Test workflow' );
      vi.mocked( generatePlanName ).mockResolvedValue( '2025_10_06_test' );

      const claudeError = new ClaudeInvocationError( 'Failed to invoke claude-code: API error' );
      vi.mocked( invokePlanWorkflow ).mockRejectedValue( claudeError );

      try {
        await command.run();
        expect.fail( 'Should have thrown an error' );
      } catch ( error ) {
        expect( error ).toBe( claudeError );
      }
    } );

    it( 'should handle file system errors', async () => {
      const command = createCommand();

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': false }
      } );

      const state = { inputCallCount: 0 };
      vi.mocked( input ).mockImplementation( ( async () => {
        state.inputCallCount++;
        return state.inputCallCount === 1 ? 'Test workflow' : 'ACCEPT';
      } ) as never );
      vi.mocked( ensureOutputAISystem ).mockResolvedValue();
      vi.mocked( generatePlanName ).mockResolvedValue( '2025_10_06_test' );
      vi.mocked( invokePlanWorkflow ).mockResolvedValue( '# Plan' );
      vi.mocked( replyToClaude ).mockResolvedValue( '# Plan' );

      const fsError = new Error( 'Permission denied' ) as NodeJS.ErrnoException;
      fsError.code = 'EACCES';
      vi.mocked( writePlanFile ).mockRejectedValue( fsError );

      await expect( command.run() ).rejects.toThrow( /Permission denied/i );
    } );
  } );

  describe( 'plan display', () => {
    it( 'should display plan content to user', async () => {
      const command = createCommand();

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': false }
      } );

      const planContent = '# Workflow Plan\n\nDetailed plan content';

      setupSuccessfulMocks( 'Test workflow', '2025_10_06_test', planContent );

      await command.run();

      expect( command.log ).toHaveBeenCalledWith(
        expect.stringContaining( planContent )
      );
    } );
  } );

  describe( 'E2E workflow execution', () => {
    it( 'should execute complete workflow with template variable injection', async () => {
      const command = createCommand();

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': false }
      } );

      const description = 'Build a user authentication workflow';
      const planName = '2025_10_06_user_authentication';
      const planContent = '# Workflow Plan: UserAuthentication\n\n' +
        '> Generated: 2025_10_06_user_authentication\n' +
        '> Description: Build a user authentication workflow';

      setupSuccessfulMocks( description, planName, planContent );

      await command.run();

      // Verify workflow planner receives correct description
      expect( invokePlanWorkflow ).toHaveBeenCalledWith( description );

      // Verify plan name generation
      expect( generatePlanName ).toHaveBeenCalledWith( description );

      // Verify plan file creation with correct parameters
      expect( writePlanFile ).toHaveBeenCalledWith(
        planName,
        expect.stringContaining( '2025_10_06_user_authentication' ),
        expect.any( String )
      );

      // Verify user sees success message
      expect( command.log ).toHaveBeenCalledWith(
        expect.stringContaining( '✅' )
      );
    } );

    it( 'should handle complex workflow descriptions', async () => {
      const command = createCommand();

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': false }
      } );

      const complexDescription = 'Build a multi-step data processing workflow with validation, transformation, and error handling';

      setupSuccessfulMocks( complexDescription, '2025_10_06_data_processing', '# Workflow Plan\n\nComplex plan content' );

      await command.run();

      expect( invokePlanWorkflow ).toHaveBeenCalledWith( complexDescription );
      expect( generatePlanName ).toHaveBeenCalledWith( complexDescription );
    } );

    it( 'should verify plan output path matches expected format', async () => {
      const command = createCommand();
      const planName = '2025_10_06_test_workflow';

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': false }
      } );

      setupSuccessfulMocks( 'Test workflow', planName, '# Plan' );

      await command.run();

      const writePlanFileCall = vi.mocked( writePlanFile ).mock.calls[0];
      expect( writePlanFileCall[0] ).toBe( planName );
      expect( writePlanFileCall[2] ).toMatch( /\/.*$/ ); // Should be absolute path
    } );
  } );

  describe( 'edge cases and error scenarios', () => {
    it( 'should handle empty plan content gracefully', async () => {
      const command = createCommand();

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': false }
      } );

      setupSuccessfulMocks( 'Test workflow', '2025_10_06_test', '' );

      await command.run();

      expect( writePlanFile ).toHaveBeenCalledWith(
        '2025_10_06_test',
        '',
        expect.any( String )
      );
    } );

    it( 'should handle network timeout errors', async () => {
      const command = createCommand();

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': false }
      } );

      vi.mocked( ensureOutputAISystem ).mockResolvedValue();
      vi.mocked( input ).mockResolvedValue( 'Test workflow' );
      vi.mocked( generatePlanName ).mockResolvedValue( '2025_10_06_test' );

      const timeoutError = new Error( 'Request timeout' );
      timeoutError.name = 'TimeoutError';
      vi.mocked( invokePlanWorkflow ).mockRejectedValue( timeoutError );

      await expect( command.run() ).rejects.toThrow( /timeout/i );
    } );

    it( 'should handle rate limit errors', async () => {
      const command = createCommand();

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': false }
      } );

      vi.mocked( ensureOutputAISystem ).mockResolvedValue();
      vi.mocked( input ).mockResolvedValue( 'Test workflow' );
      vi.mocked( generatePlanName ).mockResolvedValue( '2025_10_06_test' );

      const rateLimitError = new ClaudeInvocationError( 'Rate limit exceeded' );
      vi.mocked( invokePlanWorkflow ).mockRejectedValue( rateLimitError );

      await expect( command.run() ).rejects.toThrow( ClaudeInvocationError );
    } );

    it( 'should handle disk full errors when writing plan file', async () => {
      const command = createCommand();

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': false }
      } );

      const state = { inputCallCount: 0 };
      vi.mocked( input ).mockImplementation( ( async () => {
        state.inputCallCount++;
        return state.inputCallCount === 1 ? 'Test workflow' : 'ACCEPT';
      } ) as never );
      vi.mocked( ensureOutputAISystem ).mockResolvedValue();
      vi.mocked( generatePlanName ).mockResolvedValue( '2025_10_06_test' );
      vi.mocked( invokePlanWorkflow ).mockResolvedValue( '# Plan' );
      vi.mocked( replyToClaude ).mockResolvedValue( '# Plan' );

      const diskFullError = new Error( 'No space left on device' ) as NodeJS.ErrnoException;
      diskFullError.code = 'ENOSPC';
      vi.mocked( writePlanFile ).mockRejectedValue( diskFullError );

      await expect( command.run() ).rejects.toThrow( /space/i );
    } );

    it( 'should handle directory creation race conditions', async () => {
      const command = createCommand();

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': false }
      } );

      // First call fails with ENOENT, second succeeds
      vi.mocked( ensureOutputAISystem ).mockRejectedValueOnce(
        Object.assign( new Error( 'Directory does not exist' ), { code: 'ENOENT' } )
      );

      await expect( command.run() ).rejects.toThrow();
    } );

    it( 'should handle malformed API responses', async () => {
      const command = createCommand();

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': false }
      } );

      vi.mocked( ensureOutputAISystem ).mockResolvedValue();
      vi.mocked( input ).mockResolvedValue( 'Test workflow' );
      vi.mocked( generatePlanName ).mockResolvedValue( '2025_10_06_test' );

      const malformedError = new ClaudeInvocationError( 'Invalid JSON response' );
      vi.mocked( invokePlanWorkflow ).mockRejectedValue( malformedError );

      await expect( command.run() ).rejects.toThrow( ClaudeInvocationError );
    } );
  } );

  describe( 'template integration', () => {
    it( 'should ensure agent templates are current when force flag is set', async () => {
      const command = createCommand();

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': true }
      } );

      setupSuccessfulMocks( 'Test workflow', '2025_10_06_test', '# Plan' );
      vi.mocked( updateAgentTemplates ).mockResolvedValue();

      await command.run();

      // Verify templates are updated before plan generation
      const ensureCall = vi.mocked( ensureOutputAISystem ).mock.invocationCallOrder[0];
      const updateCall = vi.mocked( updateAgentTemplates ).mock.invocationCallOrder[0];
      expect( updateCall ).toBeGreaterThan( ensureCall );
    } );

    it( 'should not update templates when force flag is false', async () => {
      const command = createCommand();

      command.parse.mockResolvedValue( {
        args: {},
        flags: { 'force-agent-file-write': false }
      } );

      setupSuccessfulMocks( 'Test workflow', '2025_10_06_test', '# Plan' );

      await command.run();

      expect( updateAgentTemplates ).not.toHaveBeenCalled();
    } );
  } );
} );
