/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Parser } from '@oclif/core';

vi.mock( '#api/generated/api.js', () => ( {
  postWorkflowRun: vi.fn()
} ) );

vi.mock( '#services/temporal_client.js', () => ( {
  createTemporalClient: vi.fn()
} ) );

vi.mock( '#services/workflow_run_data.js', () => ( {
  collectWorkflowRunData: vi.fn()
} ) );

vi.mock( '#utils/scenario_resolver.js', () => ( {
  resolveScenarioPath: vi.fn(),
  getScenarioNotFoundMessage: vi.fn().mockReturnValue( 'not found' )
} ) );

vi.mock( '#utils/input_parser.js', () => ( {
  parseInputFlag: vi.fn()
} ) );

vi.mock( '#services/datasets.js', () => ( {
  writeDataset: vi.fn(),
  resolveDefaultDatasetsDir: vi.fn().mockResolvedValue( '/datasets' ),
  buildDataset: vi.fn().mockReturnValue( { name: 'basic' } ),
  datasetFilePath: vi.fn( ( dir: string, name: string ) => `${dir}/${name.replace( /[^a-zA-Z0-9._-]/g, '_' )}.yml` )
} ) );

describe( 'workflow dataset generate command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    delete process.env.OUTPUT_CATALOG_ID;
  } );

  const makeCmd = async ( args: Record<string, unknown>, flags: Record<string, unknown> ) => {
    const DatasetGenerate = ( await import( './generate.js' ) ).default;
    const cmd = new DatasetGenerate( [ 'my_workflow' ], {} as any );
    cmd.log = vi.fn();
    cmd.warn = vi.fn() as any;
    cmd.error = vi.fn( () => {
      throw new Error( 'error called' );
    } ) as any;
    ( cmd as any ).parse = vi.fn().mockResolvedValue( { args, flags } );
    return cmd;
  };

  describe( 'command definition', () => {
    it( 'binds the catalog flag to OUTPUT_CATALOG_ID', async () => {
      const DatasetGenerate = ( await import( './generate.js' ) ).default;
      expect( DatasetGenerate.flags ).toHaveProperty( 'catalog' );
      expect( DatasetGenerate.flags.catalog.env ).toBe( 'OUTPUT_CATALOG_ID' );
      expect( DatasetGenerate.flags.catalog.char ).toBe( 'c' );
    } );
  } );

  describe( 'command definition (flags)', () => {
    it( 'no longer has the trace modes', async () => {
      const DatasetGenerate = ( await import( './generate.js' ) ).default;
      expect( DatasetGenerate.flags ).not.toHaveProperty( 'trace' );
      expect( DatasetGenerate.flags ).not.toHaveProperty( 'download' );
      expect( DatasetGenerate.flags ).not.toHaveProperty( 'limit' );
    } );

    it( 'has the run flags and the shared Temporal flags', async () => {
      const DatasetGenerate = ( await import( './generate.js' ) ).default;
      expect( DatasetGenerate.flags ).toHaveProperty( 'workflow-id' );
      expect( DatasetGenerate.flags ).toHaveProperty( 'run-id' );
      expect( DatasetGenerate.flags ).toHaveProperty( 'profile' );
      expect( DatasetGenerate.flags ).toHaveProperty( 'address' );
      expect( DatasetGenerate.flags ).toHaveProperty( 'namespace' );
    } );

    // Parser.parse needs no oclif Config, so what oclif does with the flag relations can be pinned directly
    describe( 'flag parsing', () => {
      const parse = async ( argv: string[] ) => {
        const DatasetGenerate = ( await import( './generate.js' ) ).default;
        return Parser.parse( argv, { flags: DatasetGenerate.flags, args: DatasetGenerate.args } );
      };

      it( 'accepts --workflow-id alone, and with -r and --name', async () => {
        await expect( parse( [ 'my_workflow', '--workflow-id', 'wf-1' ] ) ).resolves.toMatchObject( { flags: { 'workflow-id': 'wf-1' } } );
        await expect( parse( [ 'my_workflow', '--workflow-id', 'wf-1', '-r', 'run-1', '--name', 'case' ] ) )
          .resolves.toMatchObject( { flags: { 'workflow-id': 'wf-1', 'run-id': 'run-1', name: 'case' } } );
      } );

      it( 'rejects --run-id without --workflow-id', async () => {
        await expect( parse( [ 'my_workflow', '--run-id', 'run-1' ] ) ).rejects.toThrow( /--workflow-id/ );
      } );

      it( 'rejects --workflow-id together with --input', async () => {
        await expect( parse( [ 'my_workflow', '--workflow-id', 'wf-1', '--input', '{}' ] ) ).rejects.toThrow( /--input/ );
      } );
    } );
  } );

  describe( 'run()', () => {
    const createCommand = async ( flagOverrides: Record<string, unknown> = {} ) => {
      const { postWorkflowRun } = await import( '#api/generated/api.js' );
      const { resolveScenarioPath } = await import( '#utils/scenario_resolver.js' );
      const { parseInputFlag } = await import( '#utils/input_parser.js' );

      const cmd = await makeCmd(
        { workflowName: 'my_workflow', scenario: 'basic' },
        { catalog: undefined, name: undefined, input: undefined, ...flagOverrides }
      );

      return {
        cmd,
        postWorkflowRun: vi.mocked( postWorkflowRun ),
        resolveScenarioPath: vi.mocked( resolveScenarioPath ),
        parseInputFlag: vi.mocked( parseInputFlag )
      };
    };

    it( 'does not connect to Temporal in scenario mode', async () => {
      const { createTemporalClient } = await import( '#services/temporal_client.js' );
      const { cmd, postWorkflowRun, resolveScenarioPath, parseInputFlag } = await createCommand();
      resolveScenarioPath.mockResolvedValue( { found: true, path: '/scenarios/basic.json', searchedPaths: [] } );
      parseInputFlag.mockResolvedValue( { foo: 'bar' } as any );
      postWorkflowRun.mockResolvedValue( { data: { workflowId: 'wf-1', output: { ok: true } }, status: 200, headers: new Headers() } as any );

      await cmd.run();

      expect( createTemporalClient ).not.toHaveBeenCalled();
    } );

    it( 'saves the scenario output with only the output and the date', async () => {
      const { buildDataset } = await import( '#services/datasets.js' );
      const { cmd, postWorkflowRun, resolveScenarioPath, parseInputFlag } = await createCommand();
      resolveScenarioPath.mockResolvedValue( { found: true, path: '/scenarios/basic.json', searchedPaths: [] } );
      parseInputFlag.mockResolvedValue( { foo: 'bar' } as any );
      postWorkflowRun.mockResolvedValue( { data: { workflowId: 'wf-1', output: { ok: true } }, status: 200, headers: new Headers() } as any );

      await cmd.run();

      expect( buildDataset ).toHaveBeenCalledWith( 'basic', { foo: 'bar' }, { ok: true } );
    } );

    it( 'resolves the scenario and runs the workflow against the resolved catalog', async () => {
      const { cmd, postWorkflowRun, resolveScenarioPath, parseInputFlag } = await createCommand( { catalog: 'my-catalog' } );
      resolveScenarioPath.mockResolvedValue( { found: true, path: '/scenarios/basic.json', searchedPaths: [] } );
      parseInputFlag.mockResolvedValue( { foo: 'bar' } as any );
      postWorkflowRun.mockResolvedValue( {
        data: { workflowId: 'wf-1', output: { ok: true } },
        status: 200,
        headers: new Headers()
      } as any );

      await cmd.run();

      expect( resolveScenarioPath ).toHaveBeenCalledWith( 'my_workflow', 'basic', undefined, undefined, 'my-catalog' );
      expect( postWorkflowRun ).toHaveBeenCalledWith(
        expect.objectContaining( { workflowName: 'my_workflow', catalog: 'my-catalog' } ),
        expect.anything()
      );
    } );
  } );

  describe( 'run() --workflow-id', () => {
    const createWorkflowIdCommand = async ( flagOverrides: Record<string, unknown> = {}, scenario?: string ) => {
      const { createTemporalClient } = await import( '#services/temporal_client.js' );
      const { collectWorkflowRunData } = await import( '#services/workflow_run_data.js' );
      const { buildDataset, writeDataset } = await import( '#services/datasets.js' );
      const close = vi.fn().mockResolvedValue( undefined );
      const client = {};
      vi.mocked( createTemporalClient ).mockResolvedValue( { client, address: 'a:1', namespace: 'default', close } as any );

      const cmd = await makeCmd(
        { workflowName: 'my_workflow', scenario },
        { name: undefined, input: undefined, 'workflow-id': 'wf-1', 'run-id': undefined, ...flagOverrides }
      );

      return {
        cmd,
        client,
        close,
        collectWorkflowRunData: vi.mocked( collectWorkflowRunData ),
        buildDataset: vi.mocked( buildDataset ),
        writeDataset: vi.mocked( writeDataset ),
        createTemporalClient: vi.mocked( createTemporalClient )
      };
    };

    it( 'reads the run from Temporal and writes a case named after the workflow id', async () => {
      const { cmd, client, close, collectWorkflowRunData, buildDataset, writeDataset, createTemporalClient } = await createWorkflowIdCommand( {
        'run-id': 'run-1',
        profile: 'prod'
      } );
      collectWorkflowRunData.mockResolvedValue( { workflowId: 'wf-1', runId: 'run-1', inputRunId: 'run-1', input: { a: 1 }, output: { ok: true } } );

      await cmd.run();

      expect( createTemporalClient ).toHaveBeenCalledWith( expect.objectContaining( { profile: 'prod' } ) );
      expect( collectWorkflowRunData ).toHaveBeenCalledWith( client, { workflowName: 'my_workflow', workflowId: 'wf-1', runId: 'run-1' } );
      expect( buildDataset ).toHaveBeenCalledWith( 'wf-1', { a: 1 }, { ok: true } );
      expect( writeDataset ).toHaveBeenCalledWith( expect.anything(), '/datasets/wf-1.yml' );
      expect( close ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'says so when the run is a continuation and the input was read from the first run', async () => {
      const { cmd, collectWorkflowRunData, buildDataset } = await createWorkflowIdCommand();
      collectWorkflowRunData.mockResolvedValue( { workflowId: 'wf-1', runId: 'run-3', inputRunId: 'run-1', input: { a: 1 }, output: null } );

      await cmd.run();

      expect( cmd.log ).toHaveBeenCalledWith(
        'Run run-3 is a continuation (continue-as-new) of workflow "wf-1". Using the input of its first run: run-1.'
      );
      expect( buildDataset ).toHaveBeenCalledWith( 'wf-1', { a: 1 }, null );
    } );

    it( 'does not mention a continuation for a run that did not continue', async () => {
      const { cmd, collectWorkflowRunData } = await createWorkflowIdCommand();
      collectWorkflowRunData.mockResolvedValue( { workflowId: 'wf-1', runId: 'run-1', inputRunId: 'run-1', input: {}, output: null } );

      await cmd.run();

      expect( cmd.log ).not.toHaveBeenCalledWith( expect.stringContaining( 'continuation' ) );
    } );

    it( 'uses --name over the workflow id', async () => {
      const { cmd, collectWorkflowRunData, buildDataset } = await createWorkflowIdCommand( { name: 'edge_case' } );
      collectWorkflowRunData.mockResolvedValue( { workflowId: 'wf-1', runId: 'run-1', inputRunId: 'run-1', input: {}, output: null } );

      await cmd.run();

      expect( buildDataset ).toHaveBeenCalledWith( 'edge_case', {}, null );
    } );

    it( 'sanitizes path separators in the workflow id used for the filename', async () => {
      const { cmd, collectWorkflowRunData, writeDataset } = await createWorkflowIdCommand( { 'workflow-id': '../../escape' } );
      collectWorkflowRunData.mockResolvedValue( { workflowId: '../../escape', runId: 'run-1', inputRunId: 'run-1', input: {}, output: null } );

      await cmd.run();

      expect( writeDataset ).toHaveBeenCalledWith( expect.anything(), '/datasets/.._.._escape.yml' );
    } );

    it( 'writes nothing and closes the connection when the run cannot be read', async () => {
      const { cmd, close, collectWorkflowRunData, writeDataset } = await createWorkflowIdCommand();
      collectWorkflowRunData.mockRejectedValue( new Error( 'not completed' ) );

      await expect( cmd.run() ).rejects.toThrow( 'error called' );

      expect( cmd.error ).toHaveBeenCalledWith( 'not completed', { exit: 1 } );
      expect( writeDataset ).not.toHaveBeenCalled();
      expect( close ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'writes nothing and reports the message when Temporal cannot be reached', async () => {
      const { cmd, createTemporalClient, collectWorkflowRunData, writeDataset } = await createWorkflowIdCommand();
      createTemporalClient.mockRejectedValue( new Error( 'Cannot connect to Temporal at localhost:1: refused' ) );

      await expect( cmd.run() ).rejects.toThrow( 'error called' );

      expect( cmd.error ).toHaveBeenCalledWith( 'Cannot connect to Temporal at localhost:1: refused', { exit: 1 } );
      expect( collectWorkflowRunData ).not.toHaveBeenCalled();
      expect( writeDataset ).not.toHaveBeenCalled();
    } );

    it( 'reports the message of a run that cannot be turned into a case', async () => {
      const { cmd, collectWorkflowRunData } = await createWorkflowIdCommand();
      const message = 'Workflow wf-1 (run run-1) is running. Only completed runs can be turned into a dataset case.';
      collectWorkflowRunData.mockRejectedValue( new Error( message ) );

      await expect( cmd.run() ).rejects.toThrow( 'error called' );

      expect( cmd.error ).toHaveBeenCalledWith( message, { exit: 1 } );
    } );

    it( 'does not touch the API or the trace', async () => {
      const { postWorkflowRun } = await import( '#api/generated/api.js' );
      const { cmd, collectWorkflowRunData } = await createWorkflowIdCommand();
      collectWorkflowRunData.mockResolvedValue( { workflowId: 'wf-1', runId: 'run-1', inputRunId: 'run-1', input: {}, output: null } );

      await cmd.run();

      expect( postWorkflowRun ).not.toHaveBeenCalled();
    } );

    it( 'rejects an empty --workflow-id without touching Temporal', async () => {
      const { cmd, createTemporalClient, collectWorkflowRunData } = await createWorkflowIdCommand( { 'workflow-id': '  ' } );

      await expect( cmd.run() ).rejects.toThrow( 'error called' );

      expect( cmd.error ).toHaveBeenCalledWith( '--workflow-id cannot be empty.', { exit: 1 } );
      expect( createTemporalClient ).not.toHaveBeenCalled();
      expect( collectWorkflowRunData ).not.toHaveBeenCalled();
    } );

    it( 'rejects a scenario argument', async () => {
      const { cmd, collectWorkflowRunData } = await createWorkflowIdCommand( {}, 'basic' );

      await expect( cmd.run() ).rejects.toThrow( 'error called' );

      expect( collectWorkflowRunData ).not.toHaveBeenCalled();
    } );
  } );
} );
