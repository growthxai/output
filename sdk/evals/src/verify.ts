import { evaluator, z } from '@outputai/core';
import type { EvaluationResult } from '@outputai/core';

export type CheckContext<TInput = unknown, TOutput = unknown> = {
  input: TInput;
  output: TOutput;
  context: { ground_truth: Record<string, unknown> };
};

type CheckFn<TInput, TOutput> = ( ctx: CheckContext<TInput, TOutput> ) => EvaluationResult | Promise<EvaluationResult>;

type VerifyOptions<I extends z.ZodType = z.ZodType<unknown>, O extends z.ZodType = z.ZodType<unknown>> = {
  name: string;
  input?: I;
  output?: O;
};

type EvaluatorInput = { input: unknown; output: unknown; ground_truth?: Record<string, unknown> };

export const verify = <I extends z.ZodType, O extends z.ZodType>(
  options: VerifyOptions<I, O>,
  fn: CheckFn<z.infer<I>, z.infer<O>>
) => {
  const inputSchema = z.object( {
    input: options.input ?? z.any(),
    output: options.output ?? z.any(),
    ground_truth: z.record( z.string(), z.unknown() ).optional()
  } );

  const wrappedFn = async ( data: EvaluatorInput ) => {
    const groundTruth = data.ground_truth ?? {};
    return fn( { input: data.input as z.infer<I>, output: data.output as z.infer<O>, context: { ground_truth: groundTruth } } );
  };

  return evaluator( {
    name: options.name,
    description: options.name,
    inputSchema,
    fn: wrappedFn as Parameters<typeof evaluator>[0]['fn']
  } );
};
