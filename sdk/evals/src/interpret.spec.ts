import { describe, it, expect } from 'vitest';
import { interpretResult } from './interpret.js';
import type { EvaluationResult } from '@outputai/core';
import type { InterpretConfig } from './schemas.js';

const makeResult = ( value: unknown ): EvaluationResult => ( {
  value,
  confidence: 1.0,
  feedback: [],
  dimensions: []
} as EvaluationResult );

describe( 'interpretResult', () => {
  describe( 'verdict config', () => {
    const config: InterpretConfig = { type: 'verdict' };

    it( 'passes through valid verdict values', () => {
      expect( interpretResult( makeResult( 'pass' ), config ) ).toBe( 'pass' );
      expect( interpretResult( makeResult( 'partial' ), config ) ).toBe( 'partial' );
      expect( interpretResult( makeResult( 'fail' ), config ) ).toBe( 'fail' );
    } );

    it( 'returns fail for invalid verdict values', () => {
      expect( interpretResult( makeResult( 'maybe' ), config ) ).toBe( 'fail' );
      expect( interpretResult( makeResult( '' ), config ) ).toBe( 'fail' );
      expect( interpretResult( makeResult( null ), config ) ).toBe( 'fail' );
      expect( interpretResult( makeResult( 42 ), config ) ).toBe( 'fail' );
    } );
  } );

  describe( 'boolean config', () => {
    const config: InterpretConfig = { type: 'boolean' };

    it( 'returns pass for true', () => {
      expect( interpretResult( makeResult( true ), config ) ).toBe( 'pass' );
    } );

    it( 'returns fail for false', () => {
      expect( interpretResult( makeResult( false ), config ) ).toBe( 'fail' );
    } );

    it( 'returns fail for truthy non-boolean values', () => {
      expect( interpretResult( makeResult( 1 ), config ) ).toBe( 'fail' );
      expect( interpretResult( makeResult( 'true' ), config ) ).toBe( 'fail' );
    } );
  } );

  describe( 'number config', () => {
    it( 'returns pass when value >= pass threshold', () => {
      const config: InterpretConfig = { type: 'number', pass: 0.8 };
      expect( interpretResult( makeResult( 0.9 ), config ) ).toBe( 'pass' );
      expect( interpretResult( makeResult( 0.8 ), config ) ).toBe( 'pass' );
      expect( interpretResult( makeResult( 1.0 ), config ) ).toBe( 'pass' );
    } );

    it( 'returns fail when value < pass threshold with no partial', () => {
      const config: InterpretConfig = { type: 'number', pass: 0.8 };
      expect( interpretResult( makeResult( 0.7 ), config ) ).toBe( 'fail' );
      expect( interpretResult( makeResult( 0 ), config ) ).toBe( 'fail' );
    } );

    it( 'returns partial when value between partial and pass thresholds', () => {
      const config: InterpretConfig = { type: 'number', pass: 0.8, partial: 0.5 };
      expect( interpretResult( makeResult( 0.6 ), config ) ).toBe( 'partial' );
      expect( interpretResult( makeResult( 0.5 ), config ) ).toBe( 'partial' );
    } );

    it( 'returns fail when value < partial threshold', () => {
      const config: InterpretConfig = { type: 'number', pass: 0.8, partial: 0.5 };
      expect( interpretResult( makeResult( 0.4 ), config ) ).toBe( 'fail' );
    } );

    it( 'returns fail for non-number values', () => {
      const config: InterpretConfig = { type: 'number', pass: 0.8 };
      expect( interpretResult( makeResult( null ), config ) ).toBe( 'fail' );
      expect( interpretResult( makeResult( undefined ), config ) ).toBe( 'fail' );
      expect( interpretResult( makeResult( 'high' ), config ) ).toBe( 'fail' );
    } );
  } );

  describe( 'string config', () => {
    it( 'returns pass for matching pass values', () => {
      const config: InterpretConfig = { type: 'string', pass: [ 'good', 'great' ] };
      expect( interpretResult( makeResult( 'good' ), config ) ).toBe( 'pass' );
      expect( interpretResult( makeResult( 'great' ), config ) ).toBe( 'pass' );
    } );

    it( 'returns partial for matching partial values', () => {
      const config: InterpretConfig = { type: 'string', pass: [ 'good' ], partial: [ 'ok', 'decent' ] };
      expect( interpretResult( makeResult( 'ok' ), config ) ).toBe( 'partial' );
      expect( interpretResult( makeResult( 'decent' ), config ) ).toBe( 'partial' );
    } );

    it( 'returns fail for non-matching values', () => {
      const config: InterpretConfig = { type: 'string', pass: [ 'good' ], partial: [ 'ok' ] };
      expect( interpretResult( makeResult( 'bad' ), config ) ).toBe( 'fail' );
      expect( interpretResult( makeResult( '' ), config ) ).toBe( 'fail' );
    } );

    it( 'returns fail when no partial config and value not in pass', () => {
      const config: InterpretConfig = { type: 'string', pass: [ 'good' ] };
      expect( interpretResult( makeResult( 'ok' ), config ) ).toBe( 'fail' );
    } );
  } );
} );
