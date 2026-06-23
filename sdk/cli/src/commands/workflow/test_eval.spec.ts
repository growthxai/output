/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '#api/generated/api.js', () => ( {
  postWorkflowRun: vi.fn()
} ) );

vi.mock( '#api/workflow_catalog.js', () => ( {
  fetchWorkflowCatalog: vi.fn()
} ) );

vi.mock( '#services/datasets.js', () => ( {
  readAllDatasets: vi.fn(),
  writeDataset: vi.fn()
} ) );

vi.mock( '#utils/eval_diagnostics.js', () => ( {
  diagnoseMissingEvalWorkflow: vi.fn().mockResolvedValue( 'missing eval workflow' )
} ) );

vi.mock( '@outputai/evals', () => ( {
  getEvalWorkflowName: ( name: string ) => `${name}_eval`,
  renderEvalOutput: vi.fn().mockReturnValue( 'rendered' ),
  computeExitCode: vi.fn().mockReturnValue( 0 ),
  EvalOutputSchema: { parse: ( value: unknown ) => value }
} ) );

const RUN_RESULT = { data: { output: { ok: true } }, status: 200, headers: new Headers() };
const EVAL_RESULT = { data: { output: { cases: [] } }, status: 200, headers: new Headers() };

describe( 'workflow test command', () => {
  beforeEach( async () => {
    vi.clearAllMocks();
    delete process.env.OUTPUT_CATALOG_ID;

    const { fetchWorkflowCatalog } = await import( '#api/workflow_catalog.js' );
    const { readAllDatasets } = await import( '#services/datasets.js' );
    vi.mocked( fetchWorkflowCatalog ).mockResolvedValue( [ { name: 'my_workflow_eval' } ] as any );
    vi.mocked( readAllDatasets ).mockResolvedValue( {
      datasets: [ { name: 'case1', input: { foo: 'bar' } } ],
      dir: '/datasets'
    } as any );
  } );

  describe( 'command definition', () => {
    it( 'binds the catalog flag to OUTPUT_CATALOG_ID', async () => {
      const WorkflowTest = ( await import( './test_eval.js' ) ).default;
      expect( WorkflowTest.flags ).toHaveProperty( 'catalog' );
      expect( WorkflowTest.flags.catalog.env ).toBe( 'OUTPUT_CATALOG_ID' );
      expect( WorkflowTest.flags.catalog.char ).toBe( 'c' );
    } );
  } );

  describe( 'run()', () => {
    const createCommand = async ( flagOverrides: Record<string, unknown> = {} ) => {
      const WorkflowTest = ( await import( './test_eval.js' ) ).default;
      const { postWorkflowRun } = await import( '#api/generated/api.js' );
      const { fetchWorkflowCatalog } = await import( '#api/workflow_catalog.js' );

      const cmd = new WorkflowTest( [ 'my_workflow' ], {} as any );
      cmd.log = vi.fn();
      cmd.error = vi.fn( () => {
        throw new Error( 'error called' );
      } ) as any;
      ( cmd as any ).exit = vi.fn();
      ( cmd as any ).parse = vi.fn().mockResolvedValue( {
        args: { workflowName: 'my_workflow' },
        flags: { catalog: undefined, cached: false, save: false, dataset: undefined, format: 'text', ...flagOverrides }
      } );

      return {
        cmd,
        postWorkflowRun: vi.mocked( postWorkflowRun ),
        fetchWorkflowCatalog: vi.mocked( fetchWorkflowCatalog )
      };
    };

    it( 'routes registration, dataset runs, and the eval run to the resolved catalog', async () => {
      const { cmd, postWorkflowRun, fetchWorkflowCatalog } = await createCommand( { catalog: 'my-catalog' } );
      postWorkflowRun
        .mockResolvedValueOnce( RUN_RESULT as any )
        .mockResolvedValueOnce( EVAL_RESULT as any );

      await cmd.run();

      expect( fetchWorkflowCatalog ).toHaveBeenCalledWith( 'my-catalog' );
      expect( postWorkflowRun ).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining( { workflowName: 'my_workflow', catalog: 'my-catalog' } ),
        expect.anything()
      );
      expect( postWorkflowRun ).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining( { workflowName: 'my_workflow_eval', catalog: 'my-catalog' } ),
        expect.anything()
      );
    } );
  } );
} );
