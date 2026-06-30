/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '#api/generated/api.js', () => ( {
  postWorkflowRun: vi.fn()
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
  extractDatasetName: vi.fn()
} ) );

describe( 'workflow dataset generate command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    delete process.env.OUTPUT_CATALOG_ID;
  } );

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
      const DatasetGenerate = ( await import( './generate.js' ) ).default;
      const { postWorkflowRun } = await import( '#api/generated/api.js' );
      const { resolveScenarioPath } = await import( '#utils/scenario_resolver.js' );
      const { parseInputFlag } = await import( '#utils/input_parser.js' );

      const cmd = new DatasetGenerate( [ 'my_workflow' ], {} as any );
      cmd.log = vi.fn();
      cmd.error = vi.fn( () => {
        throw new Error( 'error called' );
      } ) as any;
      ( cmd as any ).parse = vi.fn().mockResolvedValue( {
        args: { workflowName: 'my_workflow', scenario: 'basic' },
        flags: { catalog: undefined, trace: undefined, name: undefined, download: false, limit: 5, input: undefined, ...flagOverrides }
      } );

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
} );
