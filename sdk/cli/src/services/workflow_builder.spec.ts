import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildWorkflow, buildWorkflowInteractiveLoop } from './workflow_builder.js';
import { BUILD_COMMAND_OPTIONS, invokeBuildWorkflow, replyToClaude } from './claude_client.js';
import { input } from '@inquirer/prompts';
import { ux } from '@oclif/core';
import fs from 'node:fs/promises';

vi.mock( './claude_client.js' );
vi.mock( '@inquirer/prompts' );
vi.mock( '@oclif/core', () => ( {
  ux: {
    stdout: vi.fn(),
    error: vi.fn(),
    colorize: vi.fn( ( _color, text ) => text )
  }
} ) );
vi.mock( 'node:fs/promises' );

describe( 'workflow-builder service', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'buildWorkflow', () => {
    it( 'should build workflow from plan file', async () => {
      vi.mocked( fs.access ).mockResolvedValue( undefined );
      vi.mocked( fs.mkdir ).mockResolvedValue( undefined );
      vi.mocked( invokeBuildWorkflow ).mockResolvedValue( 'Implementation complete!' );

      const result = await buildWorkflow(
        '/path/to/plan.md',
        '/path/to/workflows/test_workflow',
        'test_workflow'
      );

      expect( fs.access ).toHaveBeenCalledWith( '/path/to/plan.md' );
      expect( fs.mkdir ).toHaveBeenCalledWith(
        expect.stringContaining( 'test_workflow' ),
        { recursive: true }
      );
      expect( invokeBuildWorkflow ).toHaveBeenCalledWith(
        expect.stringContaining( 'plan.md' ),
        expect.stringContaining( 'test_workflow' ),
        'test_workflow',
        undefined
      );
      expect( result ).toBe( 'Implementation complete!' );
    } );

    it( 'should pass additional instructions to claude-code', async () => {
      vi.mocked( fs.access ).mockResolvedValue( undefined );
      vi.mocked( fs.mkdir ).mockResolvedValue( undefined );
      vi.mocked( invokeBuildWorkflow ).mockResolvedValue( 'Done!' );

      await buildWorkflow(
        '/plan.md',
        '/workflows',
        'test',
        'Use TypeScript only'
      );

      expect( invokeBuildWorkflow ).toHaveBeenCalledWith(
        expect.any( String ),
        expect.any( String ),
        'test',
        'Use TypeScript only'
      );
    } );

    it( 'should throw error if plan file does not exist', async () => {
      vi.mocked( fs.access ).mockRejectedValue( new Error( 'ENOENT' ) );

      await expect(
        buildWorkflow( '/nonexistent/plan.md', '/workflows', 'test' )
      ).rejects.toThrow( 'Plan file not found: /nonexistent/plan.md' );

      expect( fs.mkdir ).not.toHaveBeenCalled();
      expect( invokeBuildWorkflow ).not.toHaveBeenCalled();
    } );

    it( 'should create workflow directory if it does not exist', async () => {
      vi.mocked( fs.access ).mockResolvedValue( undefined );
      vi.mocked( fs.mkdir ).mockResolvedValue( undefined );
      vi.mocked( invokeBuildWorkflow ).mockResolvedValue( 'Done' );

      await buildWorkflow(
        '/plan.md',
        '/new/workflows/test',
        'test'
      );

      expect( fs.mkdir ).toHaveBeenCalledWith(
        expect.stringContaining( 'test' ),
        { recursive: true }
      );
    } );

    it( 'should resolve paths to absolute paths', async () => {
      vi.mocked( fs.access ).mockResolvedValue( undefined );
      vi.mocked( fs.mkdir ).mockResolvedValue( undefined );
      vi.mocked( invokeBuildWorkflow ).mockResolvedValue( 'Done' );

      await buildWorkflow(
        'relative/plan.md',
        'relative/workflows',
        'test'
      );

      // Should call with absolute paths
      const calls = vi.mocked( invokeBuildWorkflow ).mock.calls[0];
      expect( calls[0] ).toMatch( /^[/\\]/ ); // Absolute path starts with / or \
      expect( calls[1] ).toMatch( /^[/\\]/ ); // Absolute path starts with / or \
    } );

    it( 'should propagate errors from claude-code invocation', async () => {
      vi.mocked( fs.access ).mockResolvedValue( undefined );
      vi.mocked( fs.mkdir ).mockResolvedValue( undefined );
      vi.mocked( invokeBuildWorkflow ).mockRejectedValue(
        new Error( 'Claude API timeout' )
      );

      await expect(
        buildWorkflow( '/plan.md', '/workflows', 'test' )
      ).rejects.toThrow( 'Claude API timeout' );
    } );

    it( 'should handle directory creation failures', async () => {
      vi.mocked( fs.access ).mockResolvedValue( undefined );
      vi.mocked( fs.mkdir ).mockRejectedValue( new Error( 'Permission denied' ) );

      await expect(
        buildWorkflow( '/plan.md', '/workflows', 'test' )
      ).rejects.toThrow( 'Permission denied' );
    } );
  } );

  describe( 'buildWorkflowInteractiveLoop', () => {
    it( 'should accept implementation immediately when user types ACCEPT', async () => {
      vi.mocked( input ).mockResolvedValue( 'ACCEPT' );

      const result = await buildWorkflowInteractiveLoop( 'Initial implementation' );

      expect( result ).toBe( 'Initial implementation' );
      expect( input ).toHaveBeenCalledOnce();
      expect( replyToClaude ).not.toHaveBeenCalled();
    } );

    it( 'should accept implementation when user types lowercase accept', async () => {
      vi.mocked( input ).mockResolvedValue( 'accept' );

      const result = await buildWorkflowInteractiveLoop( 'Initial implementation' );

      expect( result ).toBe( 'Initial implementation' );
      expect( replyToClaude ).not.toHaveBeenCalled();
    } );

    it( 'should accept implementation with extra whitespace', async () => {
      vi.mocked( input ).mockResolvedValue( '  ACCEPT  ' );

      const result = await buildWorkflowInteractiveLoop( 'Initial implementation' );

      expect( result ).toBe( 'Initial implementation' );
      expect( replyToClaude ).not.toHaveBeenCalled();
    } );

    it( 'should apply modifications and return updated implementation', async () => {
      vi.mocked( input )
        .mockResolvedValueOnce( 'Add error handling' )
        .mockResolvedValueOnce( 'ACCEPT' );
      vi.mocked( replyToClaude ).mockResolvedValue( 'Updated implementation with error handling' );

      const result = await buildWorkflowInteractiveLoop( 'Initial implementation' );

      expect( replyToClaude ).toHaveBeenCalledWith( 'Add error handling', BUILD_COMMAND_OPTIONS );
      expect( result ).toBe( 'Updated implementation with error handling' );
      expect( input ).toHaveBeenCalledTimes( 2 );
    } );

    it( 'should handle multiple modification rounds', async () => {
      vi.mocked( input )
        .mockResolvedValueOnce( 'Add logging' )
        .mockResolvedValueOnce( 'Add validation' )
        .mockResolvedValueOnce( 'ACCEPT' );

      vi.mocked( replyToClaude )
        .mockResolvedValueOnce( 'Implementation with logging' )
        .mockResolvedValueOnce( 'Implementation with logging and validation' );

      const result = await buildWorkflowInteractiveLoop( 'Initial implementation' );

      expect( replyToClaude ).toHaveBeenCalledTimes( 2 );
      expect( replyToClaude ).toHaveBeenNthCalledWith( 1, 'Add logging', BUILD_COMMAND_OPTIONS );
      expect( replyToClaude ).toHaveBeenNthCalledWith( 2, 'Add validation', BUILD_COMMAND_OPTIONS );
      expect( result ).toBe( 'Implementation with logging and validation' );
    } );

    it( 'should prompt again when user provides empty input', async () => {
      vi.mocked( input )
        .mockResolvedValueOnce( '' )
        .mockResolvedValueOnce( '  ' )
        .mockResolvedValueOnce( 'ACCEPT' );

      const result = await buildWorkflowInteractiveLoop( 'Initial implementation' );

      expect( result ).toBe( 'Initial implementation' );
      expect( input ).toHaveBeenCalledTimes( 3 );
      expect( ux.stdout ).toHaveBeenCalledWith(
        expect.stringContaining( 'provide modification instructions' )
      );
    } );

    it( 'should display implementation output to user', async () => {
      vi.mocked( input ).mockResolvedValue( 'ACCEPT' );

      await buildWorkflowInteractiveLoop( 'Implementation summary' );

      expect( ux.stdout ).toHaveBeenCalledWith(
        expect.stringContaining( 'Implementation summary' )
      );
    } );

    it( 'should display updated implementation after modifications', async () => {
      vi.mocked( input )
        .mockResolvedValueOnce( 'Improve performance' )
        .mockResolvedValueOnce( 'ACCEPT' );
      vi.mocked( replyToClaude ).mockResolvedValue( 'Optimized implementation' );

      await buildWorkflowInteractiveLoop( 'Initial' );

      expect( ux.stdout ).toHaveBeenCalledWith(
        expect.stringContaining( 'Optimized implementation' )
      );
    } );

    it( 'should handle errors from replyToClaude gracefully', async () => {
      vi.mocked( input )
        .mockResolvedValueOnce( 'Invalid modification' )
        .mockResolvedValueOnce( 'ACCEPT' );
      vi.mocked( replyToClaude ).mockRejectedValue( new Error( 'API error' ) );

      const result = await buildWorkflowInteractiveLoop( 'Original implementation' );

      // Should return original implementation after error
      expect( result ).toBe( 'Original implementation' );
      expect( ux.error ).toHaveBeenCalledWith(
        expect.stringContaining( 'Failed to apply modifications' )
      );
      expect( ux.stdout ).toHaveBeenCalledWith(
        expect.stringContaining( 'Continuing with previous version' )
      );
    } );

    it( 'should continue looping after handling error', async () => {
      vi.mocked( input )
        .mockResolvedValueOnce( 'Bad request' )
        .mockResolvedValueOnce( 'Good request' )
        .mockResolvedValueOnce( 'ACCEPT' );

      vi.mocked( replyToClaude )
        .mockRejectedValueOnce( new Error( 'API error' ) )
        .mockResolvedValueOnce( 'Fixed implementation' );

      const result = await buildWorkflowInteractiveLoop( 'Initial' );

      expect( result ).toBe( 'Fixed implementation' );
      expect( replyToClaude ).toHaveBeenCalledTimes( 2 );
    } );
  } );
} );
