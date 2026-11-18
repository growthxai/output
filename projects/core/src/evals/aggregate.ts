import { VERDICT, CRITICALITY } from './schemas.js';
import type { EvaluatorResult, Verdict } from './schemas.js';

export function aggregateCaseVerdict( evaluatorResults: EvaluatorResult[] ): Verdict {
  const required = evaluatorResults.filter( r => r.criticality === CRITICALITY.REQUIRED );

  if ( required.some( r => r.verdict === VERDICT.FAIL ) ) {
    return VERDICT.FAIL;
  }
  if ( required.some( r => r.verdict === VERDICT.PARTIAL ) ) {
    return VERDICT.PARTIAL;
  }
  return VERDICT.PASS;
}
