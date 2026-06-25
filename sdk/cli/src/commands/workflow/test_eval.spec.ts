/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEvalWorkflowName, renderEvalOutput } from '@outputai/evals';
import type { EvalOutput } from '@outputai/evals';

vi.mock( '#api/generated/api.js', () => ( {
  postWorkflowRun: vi.fn()
} ) );

vi.mock( '#services/datasets.js', () => ( {
  readAllDatasets: vi.fn(),
  writeDataset: vi.fn()
} ) );

const passingOutput: EvalOutput = {
  cases: [ { datasetName: 'd1', verdict: 'pass', evaluators: [] } ],
  summary: { total: 1, passed: 1, partial: 0, failed: 0, acceptableRate: 1 }
};

const failingOutput: EvalOutput = {
  cases: [ { datasetName: 'd1', verdict: 'fail', evaluators: [] } ],
  summary: { total: 1, passed: 0, partial: 0, failed: 1, acceptableRate: 0 }
};

describe( 'workflow test command', () => {
  const exitState: { original: typeof process.exitCode } = { original: undefined };

  beforeEach( async () => {
    vi.clearAllMocks();
    exitState.original = process.exitCode;
    process.exitCode = undefined;

    const { readAllDatasets } = await import( '#services/datasets.js' );
    vi.mocked( readAllDatasets ).mockResolvedValue( {
      datasets: [ { name: 'd1', input: {}, last_output: { output: {}, date: '2026-01-01' } } as any ],
      dir: '/tmp/datasets'
    } );
  } );

  afterEach( () => {
    process.exitCode = exitState.original;
  } );

  describe( 'command definition', () => {
    it( 'enables the built-in --json flag', async () => {
      const WorkflowTest = ( await import( './test_eval.js' ) ).default;
      expect( WorkflowTest.enableJsonFlag ).toBe( true );
    } );
  } );

  describe( 'run()', () => {
    const createCommand = async ( jsonEnabled: boolean ) => {
      const WorkflowTest = ( await import( './test_eval.js' ) ).default;
      const { postWorkflowRun } = await import( '#api/generated/api.js' );

      const cmd = new WorkflowTest( [ 'simple' ], {} as any );
      cmd.log = vi.fn();
      ( cmd as any ).jsonEnabled = vi.fn().mockReturnValue( jsonEnabled );
      ( cmd as any ).parse = vi.fn().mockResolvedValue( {
        args: { workflowName: 'simple' },
        flags: { cached: true, save: false, dataset: undefined }
      } );

      return { cmd, postWorkflowRun: vi.mocked( postWorkflowRun ) };
    };

    it( 'sets a non-zero exit code and returns the eval output when a case fails', async () => {
      const { cmd, postWorkflowRun } = await createCommand( false );
      postWorkflowRun.mockResolvedValue( { data: { output: failingOutput } } as any );

      const result = await cmd.run();

      expect( result ).toEqual( failingOutput );
      expect( process.exitCode ).toBe( 1 );
    } );

    it( 'leaves the exit code at zero and returns the eval output when all cases pass', async () => {
      const { cmd, postWorkflowRun } = await createCommand( false );
      postWorkflowRun.mockResolvedValue( { data: { output: passingOutput } } as any );

      const result = await cmd.run();

      expect( result ).toEqual( passingOutput );
      expect( process.exitCode ).toBe( 0 );
    } );

    it( 'renders the human-readable summary in text mode', async () => {
      const { cmd, postWorkflowRun } = await createCommand( false );
      postWorkflowRun.mockResolvedValue( { data: { output: passingOutput } } as any );

      await cmd.run();

      const rendered = renderEvalOutput( passingOutput, getEvalWorkflowName( 'simple' ) );
      expect( cmd.log ).toHaveBeenCalledWith( rendered );
    } );

    it( 'suppresses the rendered summary in JSON mode but still returns and sets exit code', async () => {
      const { cmd, postWorkflowRun } = await createCommand( true );
      postWorkflowRun.mockResolvedValue( { data: { output: failingOutput } } as any );

      const result = await cmd.run();

      const rendered = renderEvalOutput( failingOutput, getEvalWorkflowName( 'simple' ) );
      expect( cmd.log ).not.toHaveBeenCalledWith( rendered );
      expect( result ).toEqual( failingOutput );
      expect( process.exitCode ).toBe( 1 );
    } );
  } );
} );
