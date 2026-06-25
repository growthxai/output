/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '#api/generated/api.js', () => ( {
  postWorkflowStart: vi.fn()
} ) );

vi.mock( '#utils/resolve_input.js', () => ( {
  resolveInput: vi.fn()
} ) );

describe( 'workflow start command', () => {
  beforeEach( async () => {
    vi.clearAllMocks();
    delete process.env.OUTPUT_CATALOG_ID;
    const { resolveInput } = await import( '#utils/resolve_input.js' );
    vi.mocked( resolveInput ).mockResolvedValue( {} );
  } );

  describe( 'command definition', () => {
    it( 'should export a valid OCLIF command', async () => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      expect( WorkflowStart ).toBeDefined();
      expect( WorkflowStart.description ).toContain( 'Start a workflow' );
      expect( WorkflowStart.args ).toHaveProperty( 'workflowName' );
      expect( WorkflowStart.flags ).toHaveProperty( 'input' );
      expect( WorkflowStart.flags ).toHaveProperty( 'catalog' );
    } );

    it( 'should have correct flag configuration', async () => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      expect( WorkflowStart.flags.input.required ).toBe( false );
    } );

    it( 'should have optional scenario argument', async () => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      expect( WorkflowStart.args ).toHaveProperty( 'scenario' );
      expect( WorkflowStart.args.scenario.required ).toBe( false );
    } );

    it( 'binds the catalog flag to OUTPUT_CATALOG_ID', async () => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      expect( WorkflowStart.flags.catalog.env ).toBe( 'OUTPUT_CATALOG_ID' );
      expect( WorkflowStart.flags.catalog.char ).toBe( 'c' );
    } );
  } );

  describe( 'run()', () => {
    const createCommand = async ( flagOverrides: Record<string, unknown> = {} ) => {
      const WorkflowStart = ( await import( './start.js' ) ).default;
      const { postWorkflowStart } = await import( '#api/generated/api.js' );
      const { resolveInput } = await import( '#utils/resolve_input.js' );

      const cmd = new WorkflowStart( [ 'my_workflow' ], {} as any );
      cmd.log = vi.fn();
      cmd.error = vi.fn( () => {
        throw new Error( 'error called' );
      } ) as any;
      ( cmd as any ).parse = vi.fn().mockResolvedValue( {
        args: { workflowName: 'my_workflow', scenario: undefined },
        flags: { input: undefined, catalog: undefined, ...flagOverrides }
      } );

      return { cmd, postWorkflowStart: vi.mocked( postWorkflowStart ), resolveInput: vi.mocked( resolveInput ) };
    };

    it( 'threads the resolved catalog to resolveInput and postWorkflowStart', async () => {
      const { cmd, postWorkflowStart, resolveInput } = await createCommand( { catalog: 'my-catalog' } );
      resolveInput.mockResolvedValue( { key: 'value' } );
      postWorkflowStart.mockResolvedValue( {
        data: { workflowId: 'wf-123' },
        status: 200,
        headers: new Headers()
      } as any );

      await cmd.run();

      expect( resolveInput ).toHaveBeenCalledWith( 'my_workflow', undefined, undefined, 'start', 'my-catalog' );
      expect( postWorkflowStart ).toHaveBeenCalledWith(
        expect.objectContaining( { workflowName: 'my_workflow', catalog: 'my-catalog' } )
      );
    } );

    it( 'passes undefined catalog through when none is set', async () => {
      const { cmd, postWorkflowStart, resolveInput } = await createCommand();
      resolveInput.mockResolvedValue( {} );
      postWorkflowStart.mockResolvedValue( {
        data: { workflowId: 'wf-123' },
        status: 200,
        headers: new Headers()
      } as any );

      await cmd.run();

      expect( resolveInput ).toHaveBeenCalledWith( 'my_workflow', undefined, undefined, 'start', undefined );
    } );
  } );
} );
