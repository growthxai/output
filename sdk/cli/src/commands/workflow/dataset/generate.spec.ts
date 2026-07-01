/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '#api/generated/api.js', () => ( {
  postWorkflowRun: vi.fn()
} ) );

vi.mock( '#services/workflow_runs.js', () => ( {
  fetchWorkflowRuns: vi.fn()
} ) );

vi.mock( '#services/trace_reader.js', () => ( {
  getTrace: vi.fn()
} ) );

vi.mock( '#utils/trace_extractor.js', () => ( {
  extractDatasetFromTrace: vi.fn().mockReturnValue( { input: { a: 1 }, output: { ok: true }, executionTimeMs: 5 } )
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
  getExecutionTime: vi.fn().mockResolvedValue( 100 ),
  extractDatasetName: vi.fn(),
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

  describe( 'run()', () => {
    const createCommand = async ( flagOverrides: Record<string, unknown> = {} ) => {
      const { postWorkflowRun } = await import( '#api/generated/api.js' );
      const { resolveScenarioPath } = await import( '#utils/scenario_resolver.js' );
      const { parseInputFlag } = await import( '#utils/input_parser.js' );

      const cmd = await makeCmd(
        { workflowName: 'my_workflow', scenario: 'basic' },
        { catalog: undefined, trace: undefined, name: undefined, download: false, limit: 5, input: undefined, ...flagOverrides }
      );

      return {
        cmd,
        postWorkflowRun: vi.mocked( postWorkflowRun ),
        resolveScenarioPath: vi.mocked( resolveScenarioPath ),
        parseInputFlag: vi.mocked( parseInputFlag )
      };
    };

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

  describe( 'run() --download', () => {
    const createDownloadCommand = async ( flagOverrides: Record<string, unknown> = {} ) => {
      const { fetchWorkflowRuns } = await import( '#services/workflow_runs.js' );
      const { getTrace } = await import( '#services/trace_reader.js' );
      const { writeDataset } = await import( '#services/datasets.js' );

      const cmd = await makeCmd(
        { workflowName: 'my_workflow', scenario: undefined },
        { catalog: 'my-catalog', trace: undefined, name: undefined, download: true, limit: 5, input: undefined, ...flagOverrides }
      );

      return {
        cmd,
        fetchWorkflowRuns: vi.mocked( fetchWorkflowRuns ),
        getTrace: vi.mocked( getTrace ),
        writeDataset: vi.mocked( writeDataset )
      };
    };

    it( 'fetches recent runs scoped to the catalog and writes a dataset per run', async () => {
      const { cmd, fetchWorkflowRuns, getTrace, writeDataset } = await createDownloadCommand();
      fetchWorkflowRuns.mockResolvedValue( {
        runs: [ { workflowId: 'wf-1' }, { workflowId: 'wf-2' } ],
        count: 2
      } as any );
      getTrace.mockResolvedValue( { data: {}, location: { path: 'remote', isRemote: true } } as any );

      await cmd.run();

      expect( fetchWorkflowRuns ).toHaveBeenCalledWith( { workflowType: 'my_workflow', catalog: 'my-catalog', limit: 5 } );
      expect( getTrace ).toHaveBeenCalledTimes( 2 );
      expect( getTrace ).toHaveBeenCalledWith( 'wf-1' );
      expect( getTrace ).toHaveBeenCalledWith( 'wf-2' );
      expect( writeDataset ).toHaveBeenCalledTimes( 2 );
    } );

    it( 'skips runs whose trace cannot be fetched and continues', async () => {
      const { cmd, fetchWorkflowRuns, getTrace, writeDataset } = await createDownloadCommand();
      fetchWorkflowRuns.mockResolvedValue( {
        runs: [ { workflowId: 'wf-1' }, { workflowId: 'wf-2' } ],
        count: 2
      } as any );
      getTrace
        .mockRejectedValueOnce( new Error( 'no trace available' ) )
        .mockResolvedValueOnce( { data: {}, location: { path: 'remote', isRemote: true } } as any );

      await cmd.run();

      expect( cmd.warn ).toHaveBeenCalledWith( expect.stringContaining( 'wf-1' ) );
      expect( writeDataset ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'reports when no recent runs are found', async () => {
      const { cmd, fetchWorkflowRuns, getTrace, writeDataset } = await createDownloadCommand();
      fetchWorkflowRuns.mockResolvedValue( { runs: [], count: 0 } as any );

      await cmd.run();

      expect( getTrace ).not.toHaveBeenCalled();
      expect( writeDataset ).not.toHaveBeenCalled();
    } );

    it( 'exits non-zero when every run fails to produce a dataset', async () => {
      const { cmd, fetchWorkflowRuns, getTrace } = await createDownloadCommand();
      fetchWorkflowRuns.mockResolvedValue( { runs: [ { workflowId: 'wf-1' } ], count: 1 } as any );
      getTrace.mockRejectedValue( new Error( 'no trace available' ) );

      await expect( cmd.run() ).rejects.toThrow( 'error called' );
      expect( cmd.error ).toHaveBeenCalledWith( expect.stringContaining( 'Failed to generate' ), { exit: 1 } );
    } );

    it( 'warns about and skips runs missing a workflow ID', async () => {
      const { cmd, fetchWorkflowRuns, getTrace, writeDataset } = await createDownloadCommand();
      fetchWorkflowRuns.mockResolvedValue( { runs: [ { workflowId: undefined }, { workflowId: 'wf-1' } ], count: 2 } as any );
      getTrace.mockResolvedValue( { data: {}, location: { path: 'remote', isRemote: true } } as any );

      await cmd.run();

      expect( cmd.warn ).toHaveBeenCalledWith( expect.stringContaining( 'no workflow ID' ) );
      expect( getTrace ).toHaveBeenCalledTimes( 1 );
      expect( writeDataset ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'exits non-zero when every run is missing a workflow ID', async () => {
      const { cmd, fetchWorkflowRuns, getTrace } = await createDownloadCommand();
      fetchWorkflowRuns.mockResolvedValue( { runs: [ { workflowId: undefined }, { workflowId: undefined } ], count: 2 } as any );

      await expect( cmd.run() ).rejects.toThrow( 'error called' );
      expect( getTrace ).not.toHaveBeenCalled();
      expect( cmd.error ).toHaveBeenCalledWith( expect.stringContaining( 'none had a workflow ID' ), { exit: 1 } );
    } );

    it( 'deduplicates runs that share a workflow ID', async () => {
      const { cmd, fetchWorkflowRuns, getTrace, writeDataset } = await createDownloadCommand();
      fetchWorkflowRuns.mockResolvedValue( {
        runs: [ { workflowId: 'wf-1' }, { workflowId: 'wf-1' } ],
        count: 2
      } as any );
      getTrace.mockResolvedValue( { data: {}, location: { path: 'remote', isRemote: true } } as any );

      await cmd.run();

      expect( getTrace ).toHaveBeenCalledTimes( 1 );
      expect( writeDataset ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'sanitizes path separators in the workflow ID used for the filename', async () => {
      const { cmd, fetchWorkflowRuns, getTrace, writeDataset } = await createDownloadCommand();
      fetchWorkflowRuns.mockResolvedValue( { runs: [ { workflowId: '../../escape' } ], count: 1 } as any );
      getTrace.mockResolvedValue( { data: {}, location: { path: 'remote', isRemote: true } } as any );

      await cmd.run();

      const writtenPath = writeDataset.mock.calls[0][1] as string;
      expect( writtenPath ).toBe( '/datasets/.._.._escape.yml' );
    } );
  } );
} );
