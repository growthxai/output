import { describe, it, expect, vi, beforeEach } from 'vitest';
import { INVOKE_ACTIVITY_SYMBOL, METADATA_ACCESS_SYMBOL } from '#consts';
import { evalWorkflow } from './eval_workflow.js';

type EvalWorkflowRunner = {
  ( input: { datasets: Array<Record<string, unknown>> } ): Promise<{
    cases: Array<{
      datasetName: string;
      evaluators: Array<{ name: string; verdict: string; criticality: string }>
    }>
  }>
};

const workflowMock = vi.hoisted( () => vi.fn( ( { fn }: { fn: unknown } ) => fn ) );
const executeInParallelMock = vi.hoisted( () => vi.fn( async ( { jobs }: { jobs: Array<() => Promise<unknown>> } ) => {
  const results = await Promise.all( jobs.map( async job => ( { ok: true, result: await job() } ) ) );
  return results;
} ) );

vi.mock( '#interface/workflow', () => ( { workflow: workflowMock } ) );

vi.mock( '#interface/workflow_utils', () => ( { executeInParallel: executeInParallelMock } ) );

const createEvaluator = ( metadata?: { name?: string } ) =>
  Object.assign( async () => ( { value: true, confidence: 1 } ), metadata ? { [METADATA_ACCESS_SYMBOL]: metadata } : {} );

describe( 'evalWorkflow', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    delete ( globalThis as Record<symbol, unknown> )[INVOKE_ACTIVITY_SYMBOL];
  } );

  it( 'resolves evaluator names from the component metadata', async () => {
    const evaluator = createEvaluator( { name: 'quality_eval' } );
    const workflowFn = evalWorkflow( {
      name: 'quality',
      evals: [ {
        evaluator,
        interpret: { type: 'boolean' }
      } ]
    } ) as EvalWorkflowRunner;
    const invokeActivity = vi.fn().mockResolvedValue( { value: true, confidence: 1, feedback: [], dimensions: [] } );
    ( globalThis as Record<symbol, unknown> )[INVOKE_ACTIVITY_SYMBOL] = invokeActivity;

    const output = await workflowFn( {
      datasets: [ {
        name: 'case_1',
        input: { prompt: 'hello' },
        last_output: { output: { answer: 'hello' } },
        ground_truth: {
          shared: 'value',
          evals: {
            quality_eval: { expected: 'hello' }
          }
        }
      } ]
    } );

    expect( invokeActivity ).toHaveBeenCalledWith( 'quality_eval', {
      input: { prompt: 'hello' },
      output: { answer: 'hello' },
      ground_truth: { shared: 'value', expected: 'hello' }
    } );
    expect( output.cases[0].evaluators[0] ).toMatchObject( {
      name: 'quality_eval',
      verdict: 'pass',
      criticality: 'required'
    } );
  } );

  it( 'uses evaluator names replaced by the workflow rewriter', async () => {
    const workflowFn = evalWorkflow( {
      name: 'quality',
      evals: [ {
        evaluator: 'bundled_eval' as unknown as Function,
        interpret: { type: 'boolean' }
      } ]
    } ) as EvalWorkflowRunner;
    const invokeActivity = vi.fn().mockResolvedValue( { value: true, confidence: 1, feedback: [], dimensions: [] } );
    ( globalThis as Record<symbol, unknown> )[INVOKE_ACTIVITY_SYMBOL] = invokeActivity;

    const output = await workflowFn( { datasets: [ { name: 'case_1', input: {}, last_output: { output: {} } } ] } );

    expect( invokeActivity ).toHaveBeenCalledWith( 'bundled_eval', expect.any( Object ) );
    expect( output.cases[0].evaluators[0] ).toMatchObject( { name: 'bundled_eval', verdict: 'pass' } );
  } );

  it( 'rejects non-component evaluators', () => {
    const evaluator = createEvaluator();

    expect( () => evalWorkflow( {
      name: 'quality',
      evals: [ {
        evaluator,
        interpret: { type: 'boolean' }
      } ]
    } ) ).toThrow( 'Evaluator passed to evalWorkflow was not created with evaluator().' );
  } );

  it( 'rejects component evaluators without a component name', () => {
    const evaluator = createEvaluator( {} );

    expect( () => evalWorkflow( {
      name: 'quality',
      evals: [ {
        evaluator,
        interpret: { type: 'boolean' }
      } ]
    } ) ).toThrow( 'Evaluator component doesn\'t have a name.' );
  } );
} );
