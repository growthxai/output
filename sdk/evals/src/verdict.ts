import {
  EvaluationVerdictResult,
  EvaluationBooleanResult,
  EvaluationNumberResult,
  EvaluationStringResult,
  EvaluationFeedback
} from '@outputai/core';

type FeedbackArg = ConstructorParameters<typeof EvaluationFeedback>[0];

const boolResult = ( value: boolean, reasoning: string ) =>
  new EvaluationBooleanResult( { value, confidence: 1.0, reasoning } );

export const Verdict = {
  // --- Original helpers ---

  pass( reasoning?: string ): EvaluationVerdictResult {
    return new EvaluationVerdictResult( { value: 'pass', confidence: 1.0, reasoning } );
  },

  partial( confidence: number, reasoning?: string, feedback?: FeedbackArg[] ): EvaluationVerdictResult {
    return new EvaluationVerdictResult( {
      value: 'partial',
      confidence,
      reasoning,
      feedback: feedback ? feedback.map( f => new EvaluationFeedback( f ) ) : undefined
    } );
  },

  fail( reasoning: string, feedback?: FeedbackArg[] ): EvaluationVerdictResult {
    return new EvaluationVerdictResult( {
      value: 'fail',
      confidence: 0.0,
      reasoning,
      feedback: feedback ? feedback.map( f => new EvaluationFeedback( f ) ) : undefined
    } );
  },

  // --- Deterministic assertions (confidence 1.0 for both pass and fail) ---

  equals( actual: unknown, expected: unknown ): EvaluationBooleanResult {
    const passed = actual === expected;
    return boolResult( passed, passed ?
      `Value equals expected: ${JSON.stringify( expected )}` :
      `Expected ${JSON.stringify( expected )}, got ${JSON.stringify( actual )}`
    );
  },

  closeTo( actual: number, expected: number, tolerance: number ): EvaluationBooleanResult {
    const passed = Math.abs( actual - expected ) <= tolerance;
    return boolResult( passed, passed ?
      `${actual} is within ${tolerance} of ${expected}` :
      `${actual} is not within ${tolerance} of ${expected} (diff: ${Math.abs( actual - expected )})`
    );
  },

  gt( actual: number, threshold: number ): EvaluationBooleanResult {
    const passed = actual > threshold;
    return boolResult( passed, passed ?
      `${actual} > ${threshold}` :
      `${actual} is not greater than ${threshold}`
    );
  },

  gte( actual: number, threshold: number ): EvaluationBooleanResult {
    const passed = actual >= threshold;
    return boolResult( passed, passed ?
      `${actual} >= ${threshold}` :
      `${actual} is not greater than or equal to ${threshold}`
    );
  },

  lt( actual: number, threshold: number ): EvaluationBooleanResult {
    const passed = actual < threshold;
    return boolResult( passed, passed ?
      `${actual} < ${threshold}` :
      `${actual} is not less than ${threshold}`
    );
  },

  lte( actual: number, threshold: number ): EvaluationBooleanResult {
    const passed = actual <= threshold;
    return boolResult( passed, passed ?
      `${actual} <= ${threshold}` :
      `${actual} is not less than or equal to ${threshold}`
    );
  },

  inRange( actual: number, min: number, max: number ): EvaluationBooleanResult {
    const passed = actual >= min && actual <= max;
    return boolResult( passed, passed ?
      `${actual} is in range [${min}, ${max}]` :
      `${actual} is not in range [${min}, ${max}]`
    );
  },

  contains( haystack: string, needle: string ): EvaluationBooleanResult {
    const passed = haystack.includes( needle );
    return boolResult( passed, passed ?
      `String contains "${needle}"` :
      `String does not contain "${needle}"`
    );
  },

  matches( value: string, pattern: RegExp ): EvaluationBooleanResult {
    const passed = pattern.test( value );
    return boolResult( passed, passed ?
      `Value matches ${pattern}` :
      `Value does not match ${pattern}`
    );
  },

  includesAll( actual: unknown[], expected: unknown[] ): EvaluationBooleanResult {
    const missing = expected.filter( e => !actual.includes( e ) );
    const passed = missing.length === 0;
    return boolResult( passed, passed ?
      'Array includes all expected values' :
      `Array is missing: ${JSON.stringify( missing )}`
    );
  },

  includesAny( actual: unknown[], expected: unknown[] ): EvaluationBooleanResult {
    const found = expected.filter( e => actual.includes( e ) );
    const passed = found.length > 0;
    return boolResult( passed, passed ?
      `Array includes: ${JSON.stringify( found )}` :
      `Array includes none of: ${JSON.stringify( expected )}`
    );
  },

  isTrue( value: boolean ): EvaluationBooleanResult {
    return boolResult( value === true, value === true ? 'Value is true' : `Expected true, got ${value}` );
  },

  isFalse( value: boolean ): EvaluationBooleanResult {
    return boolResult( value === false, value === false ? 'Value is false' : `Expected false, got ${value}` );
  },

  // --- LLM judge helpers ---

  fromJudge( { verdict, reasoning }: { verdict: 'pass' | 'partial' | 'fail'; reasoning: string } ): EvaluationVerdictResult {
    return new EvaluationVerdictResult( { value: verdict, confidence: 0.9, reasoning } );
  },

  score( value: number, reasoning?: string ): EvaluationNumberResult {
    return new EvaluationNumberResult( { value, confidence: 0.9, reasoning } );
  },

  label( value: string, reasoning?: string ): EvaluationStringResult {
    return new EvaluationStringResult( { value, confidence: 0.9, reasoning } );
  }
};
