import { describe, it, expect } from 'vitest';
import { renderEvalOutput, computeExitCode } from './render.js';
import type { EvalOutput } from './schemas.js';

const makeOutput = ( cases: EvalOutput['cases'], overrides?: Partial<EvalOutput['summary']> ): EvalOutput => {
  const passed = cases.filter( c => c.verdict === 'pass' ).length;
  const partial = cases.filter( c => c.verdict === 'partial' ).length;
  const failed = cases.filter( c => c.verdict === 'fail' ).length;
  const total = cases.length;
  return {
    cases,
    summary: {
      total,
      passed,
      partial,
      failed,
      acceptableRate: total > 0 ? ( passed + partial ) / total : 0,
      ...overrides
    }
  };
};

describe( 'computeExitCode', () => {
  it( 'returns 0 when all cases pass', () => {
    const output = makeOutput( [
      { datasetName: 'a', verdict: 'pass', evaluators: [] }
    ] );
    expect( computeExitCode( output ) ).toBe( 0 );
  } );

  it( 'returns 0 when cases are partial but none fail', () => {
    const output = makeOutput( [
      { datasetName: 'a', verdict: 'partial', evaluators: [] }
    ] );
    expect( computeExitCode( output ) ).toBe( 0 );
  } );

  it( 'returns 1 when any case fails', () => {
    const output = makeOutput( [
      { datasetName: 'a', verdict: 'pass', evaluators: [] },
      { datasetName: 'b', verdict: 'fail', evaluators: [] }
    ] );
    expect( computeExitCode( output ) ).toBe( 1 );
  } );

  it( 'returns 0 for empty cases', () => {
    const output = makeOutput( [] );
    expect( computeExitCode( output ) ).toBe( 0 );
  } );
} );

describe( 'renderEvalOutput', () => {
  it( 'includes eval name when provided', () => {
    const output = makeOutput( [
      { datasetName: 'test', verdict: 'pass', evaluators: [] }
    ] );
    const rendered = renderEvalOutput( output, 'my_eval' );
    expect( rendered ).toContain( 'my_eval' );
  } );

  it( 'includes dataset names', () => {
    const output = makeOutput( [
      { datasetName: 'basic_input', verdict: 'pass', evaluators: [] },
      { datasetName: 'edge_case', verdict: 'fail', evaluators: [] }
    ] );
    const rendered = renderEvalOutput( output );
    expect( rendered ).toContain( 'basic_input' );
    expect( rendered ).toContain( 'edge_case' );
  } );

  it( 'includes verdict labels', () => {
    const output = makeOutput( [
      { datasetName: 'a', verdict: 'pass', evaluators: [] },
      { datasetName: 'b', verdict: 'fail', evaluators: [] }
    ] );
    const rendered = renderEvalOutput( output );
    expect( rendered ).toContain( 'PASS' );
    expect( rendered ).toContain( 'FAIL' );
  } );

  it( 'shows reasoning for failed evaluators', () => {
    const output = makeOutput( [
      {
        datasetName: 'test',
        verdict: 'fail',
        evaluators: [ {
          name: 'check',
          verdict: 'fail',
          criticality: 'required',
          reasoning: 'Expected 15, got null'
        } ]
      }
    ] );
    const rendered = renderEvalOutput( output );
    expect( rendered ).toContain( 'Expected 15, got null' );
  } );

  it( 'hides reasoning for passing evaluators', () => {
    const output = makeOutput( [
      {
        datasetName: 'test',
        verdict: 'pass',
        evaluators: [ {
          name: 'check',
          verdict: 'pass',
          criticality: 'required',
          reasoning: 'All good'
        } ]
      }
    ] );
    const rendered = renderEvalOutput( output );
    expect( rendered ).not.toContain( 'All good' );
  } );

  it( 'shows summary with acceptable rate', () => {
    const output = makeOutput( [
      { datasetName: 'a', verdict: 'pass', evaluators: [] },
      { datasetName: 'b', verdict: 'fail', evaluators: [] }
    ] );
    const rendered = renderEvalOutput( output );
    expect( rendered ).toContain( '1 passed' );
    expect( rendered ).toContain( '1 failed' );
    expect( rendered ).toContain( '50% acceptable' );
  } );

  it( 'includes PARTIAL verdict label', () => {
    const output = makeOutput( [
      { datasetName: 'a', verdict: 'partial', evaluators: [] }
    ] );
    const rendered = renderEvalOutput( output );
    expect( rendered ).toContain( 'PARTIAL' );
  } );

  it( 'shows reasoning for partial evaluators', () => {
    const output = makeOutput( [
      {
        datasetName: 'test',
        verdict: 'partial',
        evaluators: [ {
          name: 'check',
          verdict: 'partial',
          criticality: 'required',
          reasoning: 'Close but not quite'
        } ]
      }
    ] );
    const rendered = renderEvalOutput( output );
    expect( rendered ).toContain( 'Close but not quite' );
  } );

  it( 'renders feedback issues', () => {
    const output = makeOutput( [
      {
        datasetName: 'test',
        verdict: 'fail',
        evaluators: [ {
          name: 'check',
          verdict: 'fail',
          criticality: 'required',
          feedback: [
            { issue: 'Missing required field' },
            { issue: 'Invalid format' }
          ]
        } ]
      }
    ] );
    const rendered = renderEvalOutput( output );
    expect( rendered ).toContain( 'Missing required field' );
    expect( rendered ).toContain( 'Invalid format' );
  } );

  it( 'marks informational evaluators with (info) prefix', () => {
    const output = makeOutput( [
      {
        datasetName: 'test',
        verdict: 'pass',
        evaluators: [ {
          name: 'info_check',
          verdict: 'fail',
          criticality: 'informational'
        } ]
      }
    ] );
    const rendered = renderEvalOutput( output );
    expect( rendered ).toContain( '(info)' );
  } );
} );
