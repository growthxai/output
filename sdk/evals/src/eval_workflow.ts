import { workflow, executeInParallel, z } from '@outputai/core';
import type { EvaluationResult } from '@outputai/core';
import { getMetadata } from '@outputai/core/sdk_utils';
import { VERDICT, CRITICALITY, DatasetSchema, EvalOutputSchema } from './schemas.js';
import { interpretResult } from './interpret.js';
import { aggregateCaseVerdict } from './aggregate.js';
import type { InterpretConfig, EvalOutput, Dataset, Criticality } from './schemas.js';

export interface EvalDefinition {
  evaluator: Function;
  criticality?: Criticality;
  interpret: InterpretConfig;
}

export interface EvalWorkflowConfig {
  concurrency?: number;
}

export type EvalWorkflowInput = { datasets: Dataset[] };

export type EvalWorkflowFn = (
  input: EvalWorkflowInput,
  context: unknown
) => Promise<EvalOutput>;

export interface EvalWorkflowOptions {
  name: string;
  evals: EvalDefinition[];
  fn?: EvalWorkflowFn;
  config?: EvalWorkflowConfig;
}

interface ResolvedEvalDef {
  name: string;
  criticality: Criticality;
  interpret: InterpretConfig;
}

export function evalWorkflow( { name, evals, fn, config = {} }: EvalWorkflowOptions ): unknown {
  const concurrency = config.concurrency ?? 10;

  const evalDefs: ResolvedEvalDef[] = evals.map( def => {
    const meta = getMetadata( def.evaluator as Function & Record<symbol, unknown> );
    if ( !meta ) {
      throw new Error( 'Evaluator passed to evalWorkflow is missing metadata. Ensure it was created with evaluator().' );
    }
    return {
      name: meta.name,
      criticality: def.criticality ?? CRITICALITY.REQUIRED,
      interpret: def.interpret
    };
  } );

  const defaultFn = async function ( this: unknown, input: EvalWorkflowInput ) {
    const { invokeEvaluator } = this as { invokeEvaluator: ( name: string, input: unknown ) => Promise<unknown> };

    const jobs = input.datasets.map( ( dataset: Dataset ) => async () => {
      const evaluatorResults = [];

      for ( const evalDef of evalDefs ) {
        const { evals: perEvalTruth, ...globalTruth } = dataset.ground_truth ?? {};
        const evalTruth = perEvalTruth?.[evalDef.name] ?? {};
        const mergedTruth = { ...globalTruth, ...evalTruth };

        const result = await invokeEvaluator( evalDef.name, {
          input: dataset.input,
          output: dataset.last_output?.output,
          ground_truth: mergedTruth
        } ) as EvaluationResult;

        const verdict = interpretResult( result, evalDef.interpret );

        evaluatorResults.push( {
          name: evalDef.name,
          verdict,
          criticality: evalDef.criticality,
          confidence: result.confidence,
          reasoning: result.reasoning,
          feedback: result.feedback?.length ? result.feedback : undefined
        } );
      }

      const caseVerdict = aggregateCaseVerdict( evaluatorResults );

      return {
        datasetName: dataset.name,
        verdict: caseVerdict,
        evaluators: evaluatorResults
      };
    } );

    const results = await executeInParallel( { jobs, concurrency } );
    const cases = results.map( ( r, i ) => {
      if ( r.ok ) {
        return r.result;
      }
      const datasetName = input.datasets[i]?.name ?? `dataset_${i}`;
      return {
        datasetName,
        verdict: VERDICT.FAIL,
        evaluators: [ {
          name: '_error',
          verdict: VERDICT.FAIL,
          criticality: CRITICALITY.REQUIRED,
          reasoning: r.error instanceof Error ? r.error.message : String( r.error )
        } ]
      };
    } );

    const passed = cases.filter( c => c.verdict === VERDICT.PASS ).length;
    const partial = cases.filter( c => c.verdict === VERDICT.PARTIAL ).length;
    const failed = cases.filter( c => c.verdict === VERDICT.FAIL ).length;
    const total = cases.length;

    return {
      cases,
      summary: {
        total,
        passed,
        partial,
        failed,
        acceptableRate: total > 0 ? ( passed + partial ) / total : 0
      }
    };
  };

  return workflow( {
    name,
    description: `Eval workflow for ${name}`,
    inputSchema: z.object( { datasets: z.array( DatasetSchema ) } ),
    outputSchema: EvalOutputSchema,
    fn: fn ?? defaultFn
  } );
}
