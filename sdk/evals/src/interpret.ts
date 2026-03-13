import type { EvaluationResult } from '@outputai/core';
import { VERDICT, VerdictSchema } from './schemas.js';
import type { InterpretConfig, Verdict } from './schemas.js';

const VALID_VERDICTS = new Set( VerdictSchema.options );

const interpretVerdict = ( value: unknown ): Verdict =>
  VALID_VERDICTS.has( value as Verdict ) ? value as Verdict : VERDICT.FAIL;

const interpretBoolean = ( value: unknown ): Verdict =>
  value === true ? VERDICT.PASS : VERDICT.FAIL;

const interpretNumber = ( value: unknown, config: Extract<InterpretConfig, { type: 'number' }> ): Verdict => {
  if ( typeof value !== 'number' || Number.isNaN( value ) ) {
    return VERDICT.FAIL;
  }
  if ( value >= config.pass ) {
    return VERDICT.PASS;
  }
  if ( config.partial !== undefined && config.partial !== null && value >= config.partial ) {
    return VERDICT.PARTIAL;
  }
  return VERDICT.FAIL;
};

const interpretString = ( value: unknown, config: Extract<InterpretConfig, { type: 'string' }> ): Verdict => {
  if ( config.pass.includes( value as string ) ) {
    return VERDICT.PASS;
  }
  if ( config.partial?.includes( value as string ) ) {
    return VERDICT.PARTIAL;
  }
  return VERDICT.FAIL;
};

export const interpretResult = ( result: EvaluationResult, config: InterpretConfig ): Verdict => {
  const { value } = result;

  switch ( config.type ) {
    case 'verdict':
      return interpretVerdict( value );
    case 'boolean':
      return interpretBoolean( value );
    case 'number':
      return interpretNumber( value, config );
    case 'string':
      return interpretString( value, config );
    default:
      return VERDICT.FAIL;
  }
};
