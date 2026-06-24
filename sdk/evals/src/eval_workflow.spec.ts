import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evalWorkflow } from './eval_workflow.js';

type EvalWorkflowRunner = {
  call: (
    context: { invokeEvaluator: ( name: string, input: unknown ) => Promise<unknown> },
    input: { datasets: Array<Record<string, unknown>> }
  ) => Promise<{
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
const hasMock = vi.hoisted( () => vi.fn() );
const getNameMock = vi.hoisted( () => vi.fn() );

vi.mock( '@outputai/core', async importOriginal => {
  const actual = await importOriginal<typeof import( '@outputai/core' )>();
  return {
    ...actual,
    workflow: workflowMock,
    executeInParallel: executeInParallelMock
  };
} );

vi.mock( '@outputai/core/sdk/helpers', () => ( {
  ComponentMetadata: {
    has: hasMock,
    getName: getNameMock
  }
} ) );

describe( 'evalWorkflow', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    hasMock.mockReturnValue( true );
    getNameMock.mockReturnValue( 'quality_eval' );
  } );

  it( 'resolves evaluator names with ComponentMetadata.getName', async () => {
    const evaluator = async () => ( { value: true, confidence: 1, feedback: [], dimensions: [] } );
    const workflowFn = evalWorkflow( {
      name: 'quality',
      evals: [ {
        evaluator,
        interpret: { type: 'boolean' }
      } ]
    } ) as EvalWorkflowRunner;
    const invokeEvaluator = vi.fn().mockResolvedValue( { value: true, confidence: 1, feedback: [], dimensions: [] } );

    const output = await workflowFn.call( { invokeEvaluator }, {
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

    expect( hasMock ).toHaveBeenCalledWith( evaluator );
    expect( getNameMock ).toHaveBeenCalledWith( evaluator );
    expect( invokeEvaluator ).toHaveBeenCalledWith( 'quality_eval', {
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

  it( 'rejects non-component evaluators', () => {
    const evaluator = async () => ( { value: true, confidence: 1 } );
    hasMock.mockReturnValue( false );

    expect( () => evalWorkflow( {
      name: 'quality',
      evals: [ {
        evaluator,
        interpret: { type: 'boolean' }
      } ]
    } ) ).toThrow( 'Evaluator passed to evalWorkflow was not created with evaluator().' );
    expect( hasMock ).toHaveBeenCalledWith( evaluator );
    expect( getNameMock ).not.toHaveBeenCalled();
  } );

  it( 'rejects component evaluators without a component name', () => {
    const evaluator = async () => ( { value: true, confidence: 1 } );
    getNameMock.mockReturnValue( undefined );

    expect( () => evalWorkflow( {
      name: 'quality',
      evals: [ {
        evaluator,
        interpret: { type: 'boolean' }
      } ]
    } ) ).toThrow( 'Evaluator component doesn\'t have a name.' );
    expect( hasMock ).toHaveBeenCalledWith( evaluator );
    expect( getNameMock ).toHaveBeenCalledWith( evaluator );
  } );
} );
