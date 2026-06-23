import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evalWorkflow } from './eval_workflow.js';

type TestEvaluator = ( () => Promise<unknown> ) & { componentName?: string };
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
const isComponentMock = vi.hoisted( () => vi.fn( ( fn: Function ) => Object.hasOwn( fn, 'componentName' ) ) );
const getComponentNameMock = vi.hoisted( () => vi.fn( ( fn: Function ) => ( fn as TestEvaluator ).componentName ) );

vi.mock( '@outputai/core', async importOriginal => {
  const actual = await importOriginal<typeof import( '@outputai/core' )>();
  return {
    ...actual,
    workflow: workflowMock,
    executeInParallel: executeInParallelMock
  };
} );

vi.mock( '@outputai/core/internal/workflow', () => ( {
  Component: {
    isComponent: isComponentMock,
    getComponentName: getComponentNameMock
  }
} ) );

const makeEvaluator = ( componentName: string | undefined ): TestEvaluator => {
  const evaluator = async () => ( { value: true, confidence: 1, feedback: [], dimensions: [] } );
  Object.defineProperty( evaluator, 'componentName', { value: componentName } );
  return evaluator as TestEvaluator;
};

describe( 'evalWorkflow', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'resolves evaluator names with Component.getComponentName', async () => {
    const evaluator = makeEvaluator( 'quality_eval' );
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

    expect( getComponentNameMock ).toHaveBeenCalledWith( evaluator );
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

    expect( () => evalWorkflow( {
      name: 'quality',
      evals: [ {
        evaluator,
        interpret: { type: 'boolean' }
      } ]
    } ) ).toThrow( 'Evaluator passed to evalWorkflow was not created with evaluator().' );
  } );

  it( 'rejects component evaluators without a component name', () => {
    expect( () => evalWorkflow( {
      name: 'quality',
      evals: [ {
        evaluator: makeEvaluator( undefined ),
        interpret: { type: 'boolean' }
      } ]
    } ) ).toThrow( 'Evaluator component doesn\'t have a name.' );
  } );
} );
