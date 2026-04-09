/* eslint-disable no-restricted-syntax, @typescript-eslint/no-explicit-any, init-declarations */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Generate from './generate.js';
import { generateWorkflow } from '#services/workflow_generator.js';
import { parseWorkflowDir } from '#utils/workflow_dir_parser.js';
import { InvalidNameError, WorkflowExistsError } from '#types/errors.js';

vi.mock( '../../services/workflow_generator.js' );
vi.mock( '../../utils/workflow_dir_parser.js' );

describe( 'Generate Command', () => {
  let mockGenerateWorkflow: any;
  let mockParseWorkflowDir: any;
  let logSpy: any;

  const createCommand = () => {
    const cmd = new Generate( [], {} as any );

    cmd.log = vi.fn();
    cmd.error = vi.fn( ( message: string ) => {
      throw new Error( message );
    } ) as any;

    ( cmd as any ).parse = vi.fn();

    logSpy = cmd.log;

    return cmd;
  };

  beforeEach( () => {
    vi.clearAllMocks();

    mockGenerateWorkflow = vi.mocked( generateWorkflow );
    mockParseWorkflowDir = vi.mocked( parseWorkflowDir );
  } );

  describe( 'successful workflow generation', () => {
    it( 'should generate workflow with skeleton flag', async () => {
      const cmd = createCommand();

      ( cmd as any ).parse.mockResolvedValue( {
        args: { name: 'test-workflow' },
        flags: {
          skeleton: true,
          description: 'Test description',
          'output-dir': '/tmp',
          force: false
        }
      } );

      mockGenerateWorkflow.mockResolvedValue( {
        workflowName: 'test-workflow',
        targetDir: '/tmp/test-workflow',
        filesCreated: [ 'index.ts', 'steps.ts', 'types.ts' ]
      } );

      mockParseWorkflowDir.mockReturnValue( {
        workflowId: 'testWorkflow',
        scenarioNames: [ 'test_input' ]
      } );

      await cmd.run();

      expect( mockGenerateWorkflow ).toHaveBeenCalledWith( {
        name: 'test-workflow',
        description: 'Test description',
        outputDir: '/tmp',
        skeleton: true,
        force: false
      } );

      expect( logSpy ).toHaveBeenCalledWith(
        expect.stringContaining( 'SUCCESS!' )
      );
      expect( logSpy ).toHaveBeenCalledWith(
        expect.stringContaining( 'test-workflow' )
      );
    } );

    it( 'should require skeleton flag and reject without it', async () => {
      const cmd = createCommand();

      ( cmd as any ).parse.mockResolvedValue( {
        args: { name: 'test-workflow' },
        flags: {
          skeleton: false,
          'output-dir': '/tmp',
          force: false
        }
      } );

      await expect( cmd.run() ).rejects.toThrow(
        'Full workflow generation not implemented yet. Please use --skeleton flag'
      );

      expect( mockGenerateWorkflow ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'error handling', () => {
    it( 'should handle invalid name error', async () => {
      const cmd = createCommand();

      ( cmd as any ).parse.mockResolvedValue( {
        args: { name: 'invalid name' },
        flags: { 'output-dir': '/tmp', skeleton: true, force: false }
      } );

      mockGenerateWorkflow.mockRejectedValue(
        new InvalidNameError( 'invalid name' )
      );

      await expect( cmd.run() ).rejects.toThrow( /Invalid workflow name/i );
    } );

    it( 'should handle workflow exists error', async () => {
      const cmd = createCommand();

      ( cmd as any ).parse.mockResolvedValue( {
        args: { name: 'existing-workflow' },
        flags: { 'output-dir': '/tmp', skeleton: true, force: false }
      } );

      mockGenerateWorkflow.mockRejectedValue(
        new WorkflowExistsError( 'existing-workflow', '/tmp/existing-workflow' )
      );

      await expect( cmd.run() ).rejects.toThrow( /already exists/i );
    } );

    it( 'should re-throw non-CLI errors', async () => {
      const cmd = createCommand();

      ( cmd as any ).parse.mockResolvedValue( {
        args: { name: 'test-workflow' },
        flags: { 'output-dir': '/tmp', skeleton: true, force: false }
      } );

      const systemError = new Error( 'System error' );
      mockGenerateWorkflow.mockRejectedValue( systemError );

      await expect( cmd.run() ).rejects.toThrow( systemError );
    } );
  } );

  describe( 'success display', () => {
    it( 'should display correct success message and next steps', async () => {
      const cmd = createCommand();

      ( cmd as any ).parse.mockResolvedValue( {
        args: { name: 'my-workflow' },
        flags: { 'output-dir': '/custom/path', skeleton: true, force: false }
      } );

      mockGenerateWorkflow.mockResolvedValue( {
        workflowName: 'my-workflow',
        targetDir: '/custom/path/my-workflow',
        filesCreated: [ 'index.ts', 'steps.ts', 'types.ts' ]
      } );

      mockParseWorkflowDir.mockReturnValue( {
        workflowId: 'myWorkflow',
        scenarioNames: [ 'test_input' ]
      } );

      await cmd.run();

      expect( logSpy ).toHaveBeenCalledWith(
        expect.stringContaining( 'SUCCESS!' )
      );
      expect( logSpy ).toHaveBeenCalledWith(
        expect.stringContaining( 'my-workflow' )
      );
      expect( logSpy ).toHaveBeenCalledWith(
        expect.stringContaining( '/custom/path/my-workflow' )
      );
      expect( logSpy ).toHaveBeenCalledWith(
        expect.stringContaining( 'NEXT STEPS' )
      );
    } );
  } );
} );
