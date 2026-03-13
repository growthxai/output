import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { invokePlanWorkflow, ClaudeInvocationError } from './claude_client.js';
import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { isError } from '#utils/error_utils.js';

// Mock Claude SDK
vi.mock( '@anthropic-ai/claude-agent-sdk', () => ( {
  query: vi.fn()
} ) );

describe( 'invokePlanWorkflow', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  afterEach( () => {
    // Clean up environment variables
    delete process.env.ANTHROPIC_API_KEY;
  } );

  it( 'should invoke /outputai:plan_workflow slash command with settingSources', async () => {
    const { query } = await import( '@anthropic-ai/claude-agent-sdk' );

    process.env.ANTHROPIC_API_KEY = 'test-key';

    async function *mockIterator() {
      yield { type: 'result', subtype: 'success', result: '# Test Plan\n\nTest plan content' };
    }

    vi.mocked( query ).mockReturnValue( mockIterator() as unknown as Query );

    await invokePlanWorkflow( 'Test workflow' );

    const calls = vi.mocked( query ).mock.calls;
    expect( calls[0]?.[0]?.prompt ).toContain( '/outputai:plan_workflow Test workflow' );
    expect( calls[0]?.[0]?.options?.settingSources ).toEqual( [ 'user', 'project', 'local' ] );
    expect( calls[0]?.[0]?.options?.allowedTools ).toEqual( [ 'Read', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite' ] );
  } );

  it( 'should pass workflow description to slash command', async () => {
    const { query } = await import( '@anthropic-ai/claude-agent-sdk' );

    process.env.ANTHROPIC_API_KEY = 'test-key';

    async function *mockIterator() {
      yield { type: 'result', subtype: 'success', result: '# Plan\n\nContent' };
    }

    vi.mocked( query ).mockReturnValue( mockIterator() as unknown as Query );

    const description = 'Build a user authentication system';
    await invokePlanWorkflow( description );

    const calls = vi.mocked( query ).mock.calls;
    expect( calls[0]?.[0]?.prompt ).toContain( `/outputai:plan_workflow ${description}` );
    expect( calls[0]?.[0]?.options?.settingSources ).toEqual( [ 'user', 'project', 'local' ] );
  } );

  it( 'should return plan output from claude-code', async () => {
    const { query } = await import( '@anthropic-ai/claude-agent-sdk' );

    process.env.ANTHROPIC_API_KEY = 'test-key';

    const expectedOutput = '# Workflow Plan\n\nDetailed plan content here';

    async function *mockIterator() {
      yield { type: 'result', subtype: 'success', result: expectedOutput };
    }

    vi.mocked( query ).mockReturnValue( mockIterator() as unknown as Query );

    const result = await invokePlanWorkflow( 'Test' );

    expect( result ).toBe( expectedOutput );
  } );

  it( 'should throw error if API key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    await expect( invokePlanWorkflow( 'Test' ) )
      .rejects.toThrow( 'ANTHROPIC_API_KEY' );
  } );

  describe( 'error handling', () => {
    it( 'should throw ClaudeInvocationError on API failures', async () => {
      const { query } = await import( '@anthropic-ai/claude-agent-sdk' );

      process.env.ANTHROPIC_API_KEY = 'test-key';

      const apiError = new Error( 'API connection failed' );
      vi.mocked( query ).mockRejectedValue( apiError );

      await expect( invokePlanWorkflow( 'Test' ) )
        .rejects.toThrow( ClaudeInvocationError );
    } );

    it( 'should preserve original error in cause property', async () => {
      const { query } = await import( '@anthropic-ai/claude-agent-sdk' );

      process.env.ANTHROPIC_API_KEY = 'test-key';

      const originalError = new Error( 'Network timeout' );

      // Mock async iterator that throws
      async function *mockIterator(): AsyncGenerator<never, never, unknown> {
        throw originalError;
      }

      vi.mocked( query ).mockReturnValue( mockIterator() as unknown as Query );

      try {
        await invokePlanWorkflow( 'Test' );
        // If we get here, the test should fail
        expect.fail( 'Should have thrown an error' );
      } catch ( error ) {
        expect( error ).toBeInstanceOf( ClaudeInvocationError );
        expect( ( error as ClaudeInvocationError ).cause ).toBe( originalError );
      }
    } );

    it( 'should handle rate limit errors', async () => {
      const { query } = await import( '@anthropic-ai/claude-agent-sdk' );

      process.env.ANTHROPIC_API_KEY = 'test-key';

      const rateLimitError = new Error( 'Rate limit exceeded' );
      ( rateLimitError as { status?: number } ).status = 429;
      vi.mocked( query ).mockRejectedValue( rateLimitError );

      await expect( invokePlanWorkflow( 'Test' ) )
        .rejects.toThrow( ClaudeInvocationError );
    } );

    it( 'should handle authentication errors', async () => {
      const { query } = await import( '@anthropic-ai/claude-agent-sdk' );

      process.env.ANTHROPIC_API_KEY = 'invalid-key';

      const authError = new Error( 'Invalid API key' );
      ( authError as { status?: number } ).status = 401;
      vi.mocked( query ).mockRejectedValue( authError );

      await expect( invokePlanWorkflow( 'Test' ) )
        .rejects.toThrow( ClaudeInvocationError );
    } );

    it( 'should provide user-friendly error messages', async () => {
      const { query } = await import( '@anthropic-ai/claude-agent-sdk' );

      process.env.ANTHROPIC_API_KEY = 'test-key';

      vi.mocked( query ).mockRejectedValue( new Error( 'API error' ) );

      try {
        await invokePlanWorkflow( 'Test' );
      } catch ( error ) {
        expect( isError( error ) ).toBe( true );
        if ( isError( error ) ) {
          expect( error.message ).toMatch( /Failed to invoke/i );
        }
      }
    } );

    it( 'should throw error when no result received', async () => {
      const { query } = await import( '@anthropic-ai/claude-agent-sdk' );

      process.env.ANTHROPIC_API_KEY = 'test-key';

      // Mock iterator that yields no result messages
      async function *mockIterator() {
        yield { type: 'assistant', message: { content: [] } };
      }

      vi.mocked( query ).mockReturnValue( mockIterator() as unknown as Query );

      await expect( invokePlanWorkflow( 'Test' ) )
        .rejects.toThrow( ClaudeInvocationError );
    } );
  } );
} );

describe( 'ClaudeInvocationError', () => {
  it( 'should be instance of Error', () => {
    const error = new ClaudeInvocationError( 'test message' );
    expect( error ).toBeInstanceOf( Error );
  } );

  it( 'should have correct name property', () => {
    const error = new ClaudeInvocationError( 'test message' );
    expect( error.name ).toBe( 'ClaudeInvocationError' );
  } );

  it( 'should store cause error', () => {
    const causeError = new Error( 'original error' );
    const error = new ClaudeInvocationError( 'test message', causeError );
    expect( error.cause ).toBe( causeError );
  } );
} );
