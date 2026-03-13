import { describe, it, expect } from 'vitest';
import { Verdict } from './verdict.js';
import {
  EvaluationBooleanResult,
  EvaluationVerdictResult,
  EvaluationNumberResult,
  EvaluationStringResult
} from '@outputai/core';

describe( 'Verdict', () => {

  // --- Original helpers regression ---

  describe( 'pass', () => {
    it( 'returns EvaluationVerdictResult with value "pass"', () => {
      const r = Verdict.pass( 'looks good' );
      expect( r ).toBeInstanceOf( EvaluationVerdictResult );
      expect( r.value ).toBe( 'pass' );
      expect( r.confidence ).toBe( 1.0 );
      expect( r.reasoning ).toBe( 'looks good' );
    } );
  } );

  describe( 'partial', () => {
    it( 'returns EvaluationVerdictResult with value "partial"', () => {
      const r = Verdict.partial( 0.7, 'mostly ok' );
      expect( r ).toBeInstanceOf( EvaluationVerdictResult );
      expect( r.value ).toBe( 'partial' );
      expect( r.confidence ).toBe( 0.7 );
    } );
  } );

  describe( 'fail', () => {
    it( 'returns EvaluationVerdictResult with value "fail"', () => {
      const r = Verdict.fail( 'wrong' );
      expect( r ).toBeInstanceOf( EvaluationVerdictResult );
      expect( r.value ).toBe( 'fail' );
      expect( r.confidence ).toBe( 0.0 );
    } );
  } );

  // --- Deterministic assertions ---

  describe( 'equals', () => {
    it( 'passes when values are strictly equal', () => {
      const r = Verdict.equals( 42, 42 );
      expect( r ).toBeInstanceOf( EvaluationBooleanResult );
      expect( r.value ).toBe( true );
      expect( r.confidence ).toBe( 1.0 );
    } );

    it( 'fails when values differ', () => {
      const r = Verdict.equals( 42, 43 );
      expect( r.value ).toBe( false );
      expect( r.confidence ).toBe( 1.0 );
    } );
  } );

  describe( 'closeTo', () => {
    it( 'passes within tolerance', () => {
      const r = Verdict.closeTo( 3.14, 3.15, 0.02 );
      expect( r.value ).toBe( true );
    } );

    it( 'fails outside tolerance', () => {
      const r = Verdict.closeTo( 3.14, 3.20, 0.02 );
      expect( r.value ).toBe( false );
    } );
  } );

  describe( 'gt', () => {
    it( 'passes when actual > threshold', () => {
      expect( Verdict.gt( 5, 3 ).value ).toBe( true );
    } );
    it( 'fails when actual <= threshold', () => {
      expect( Verdict.gt( 3, 3 ).value ).toBe( false );
    } );
  } );

  describe( 'gte', () => {
    it( 'passes when actual >= threshold', () => {
      expect( Verdict.gte( 3, 3 ).value ).toBe( true );
    } );
    it( 'fails when actual < threshold', () => {
      expect( Verdict.gte( 2, 3 ).value ).toBe( false );
    } );
  } );

  describe( 'lt', () => {
    it( 'passes when actual < threshold', () => {
      expect( Verdict.lt( 2, 3 ).value ).toBe( true );
    } );
    it( 'fails when actual >= threshold', () => {
      expect( Verdict.lt( 3, 3 ).value ).toBe( false );
    } );
  } );

  describe( 'lte', () => {
    it( 'passes when actual <= threshold', () => {
      expect( Verdict.lte( 3, 3 ).value ).toBe( true );
    } );
    it( 'fails when actual > threshold', () => {
      expect( Verdict.lte( 4, 3 ).value ).toBe( false );
    } );
  } );

  describe( 'inRange', () => {
    it( 'passes when value is in range', () => {
      expect( Verdict.inRange( 5, 1, 10 ).value ).toBe( true );
    } );
    it( 'passes at boundaries', () => {
      expect( Verdict.inRange( 1, 1, 10 ).value ).toBe( true );
      expect( Verdict.inRange( 10, 1, 10 ).value ).toBe( true );
    } );
    it( 'fails when value is out of range', () => {
      expect( Verdict.inRange( 11, 1, 10 ).value ).toBe( false );
    } );
  } );

  describe( 'contains', () => {
    it( 'passes when haystack includes needle', () => {
      expect( Verdict.contains( 'hello world', 'world' ).value ).toBe( true );
    } );
    it( 'fails when haystack does not include needle', () => {
      expect( Verdict.contains( 'hello world', 'xyz' ).value ).toBe( false );
    } );
  } );

  describe( 'matches', () => {
    it( 'passes when value matches pattern', () => {
      expect( Verdict.matches( 'abc123', /\d+/ ).value ).toBe( true );
    } );
    it( 'fails when value does not match', () => {
      expect( Verdict.matches( 'abc', /\d+/ ).value ).toBe( false );
    } );
  } );

  describe( 'includesAll', () => {
    it( 'passes when all expected values are present', () => {
      expect( Verdict.includesAll( [ 1, 2, 3 ], [ 1, 3 ] ).value ).toBe( true );
    } );
    it( 'fails when some expected values are missing', () => {
      const r = Verdict.includesAll( [ 1, 2 ], [ 2, 3 ] );
      expect( r.value ).toBe( false );
      expect( r.reasoning ).toContain( '3' );
    } );
  } );

  describe( 'includesAny', () => {
    it( 'passes when at least one expected value is present', () => {
      expect( Verdict.includesAny( [ 1, 2, 3 ], [ 5, 2 ] ).value ).toBe( true );
    } );
    it( 'fails when no expected values are present', () => {
      expect( Verdict.includesAny( [ 1, 2 ], [ 5, 6 ] ).value ).toBe( false );
    } );
  } );

  describe( 'isTrue', () => {
    it( 'passes for true', () => {
      expect( Verdict.isTrue( true ).value ).toBe( true );
    } );
    it( 'fails for false', () => {
      expect( Verdict.isTrue( false ).value ).toBe( false );
    } );
  } );

  describe( 'isFalse', () => {
    it( 'passes for false', () => {
      expect( Verdict.isFalse( false ).value ).toBe( true );
    } );
    it( 'fails for true', () => {
      expect( Verdict.isFalse( true ).value ).toBe( false );
    } );
  } );

  // --- LLM judge helpers ---

  describe( 'fromJudge', () => {
    it( 'returns EvaluationVerdictResult with 0.9 confidence', () => {
      const r = Verdict.fromJudge( { verdict: 'pass', reasoning: 'on topic' } );
      expect( r ).toBeInstanceOf( EvaluationVerdictResult );
      expect( r.value ).toBe( 'pass' );
      expect( r.confidence ).toBe( 0.9 );
      expect( r.reasoning ).toBe( 'on topic' );
    } );

    it( 'handles all verdict values', () => {
      expect( Verdict.fromJudge( { verdict: 'partial', reasoning: 'ok' } ).value ).toBe( 'partial' );
      expect( Verdict.fromJudge( { verdict: 'fail', reasoning: 'bad' } ).value ).toBe( 'fail' );
    } );
  } );

  describe( 'score', () => {
    it( 'returns EvaluationNumberResult with 0.9 confidence', () => {
      const r = Verdict.score( 0.85, 'good quality' );
      expect( r ).toBeInstanceOf( EvaluationNumberResult );
      expect( r.value ).toBe( 0.85 );
      expect( r.confidence ).toBe( 0.9 );
      expect( r.reasoning ).toBe( 'good quality' );
    } );
  } );

  describe( 'label', () => {
    it( 'returns EvaluationStringResult with 0.9 confidence', () => {
      const r = Verdict.label( 'formal', 'professional writing' );
      expect( r ).toBeInstanceOf( EvaluationStringResult );
      expect( r.value ).toBe( 'formal' );
      expect( r.confidence ).toBe( 0.9 );
      expect( r.reasoning ).toBe( 'professional writing' );
    } );
  } );
} );
