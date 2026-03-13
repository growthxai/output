import { describe, it, expect } from 'vitest';
import { aggregateCaseVerdict } from './aggregate.js';
import type { EvaluatorResult } from './schemas.js';

const makeResult = ( verdict: 'pass' | 'partial' | 'fail', criticality: 'required' | 'informational' = 'required' ): EvaluatorResult => ( {
  name: 'test_eval',
  verdict,
  criticality
} );

describe( 'aggregateCaseVerdict', () => {
  it( 'returns pass when all required evaluators pass', () => {
    expect( aggregateCaseVerdict( [
      makeResult( 'pass' ),
      makeResult( 'pass' )
    ] ) ).toBe( 'pass' );
  } );

  it( 'returns fail when any required evaluator fails', () => {
    expect( aggregateCaseVerdict( [
      makeResult( 'pass' ),
      makeResult( 'fail' )
    ] ) ).toBe( 'fail' );
  } );

  it( 'returns partial when any required evaluator is partial and none fail', () => {
    expect( aggregateCaseVerdict( [
      makeResult( 'pass' ),
      makeResult( 'partial' )
    ] ) ).toBe( 'partial' );
  } );

  it( 'returns fail over partial when both exist', () => {
    expect( aggregateCaseVerdict( [
      makeResult( 'partial' ),
      makeResult( 'fail' )
    ] ) ).toBe( 'fail' );
  } );

  it( 'ignores informational evaluators for verdict', () => {
    expect( aggregateCaseVerdict( [
      makeResult( 'pass' ),
      makeResult( 'fail', 'informational' )
    ] ) ).toBe( 'pass' );
  } );

  it( 'returns pass when only informational evaluators fail', () => {
    expect( aggregateCaseVerdict( [
      makeResult( 'fail', 'informational' ),
      makeResult( 'partial', 'informational' )
    ] ) ).toBe( 'pass' );
  } );

  it( 'returns pass for empty evaluator list', () => {
    expect( aggregateCaseVerdict( [] ) ).toBe( 'pass' );
  } );
} );
