import type { z } from 'zod';
import type { AnyZodSchema, TemporalActivityOptions } from './types.d.ts';
import type { EvaluationResult } from './evaluation_result.d.ts';

/**
 * Options for an evaluator.
 */
export type EvaluatorOptions = {

  /**
   * Temporal activity options for this evaluator.
   */
  activityOptions?: TemporalActivityOptions
};

/**
 * The handler function of an evaluator.
 *
 * @param input - Parsed evaluator input (`z.infer<inputSchema>`).
 *
 * @returns The result of the evaluation.
 */
export type EvaluatorFunction<
  InputSchema extends AnyZodSchema | undefined = undefined,
  Result extends EvaluationResult = EvaluationResult
> = InputSchema extends AnyZodSchema ?
  ( input: z.infer<InputSchema> ) => Promise<Result> :
  () => Promise<Result>;

/**
 * A wrapper around the user defined `fn` handler function.
 *
 * Callers pass values accepted by `inputSchema` (`z.input`). The wrapper parses input
 * and invokes `fn`.
 */
export type EvaluatorFunctionWrapper<
  InputSchema extends AnyZodSchema | undefined = undefined,
  Result extends EvaluationResult = EvaluationResult
> = InputSchema extends AnyZodSchema ?
  ( input: z.input<InputSchema> ) => Promise<Result> :
  () => Promise<Result>;

/**
 * Creates an evaluation function. It is similar to a step, but must return an EvaluationResult.
 *
 * It is translated to a Temporal Activity.
 *
 * @typeParam InputSchema - Zod schema of the fn's input.
 * @typeParam Result - Return type of the fn, extends EvaluationResult.
 *
 * @throws {@link ValidationError}
 * @throws {@link FatalError}
 *
 * @param params - Evaluator parameters
 * @param params.name - Human-readable evaluator name (must start with a letter or underscore, followed by letters, numbers, or underscores)
 * @param params.description - Description of the evaluator
 * @param params.inputSchema - Zod schema for the `fn` input
 * @param params.fn - A function containing the evaluator code
 * @param params.options - Optional evaluator options.
 * @returns A wrapper function around the `fn` function
 */
export declare function evaluator<
  InputSchema extends AnyZodSchema,
  Result extends EvaluationResult
>( params: {
  name: string;
  description?: string;
  inputSchema: InputSchema;
  fn: EvaluatorFunction<InputSchema, Result>;
  options?: EvaluatorOptions;
} ): EvaluatorFunctionWrapper<InputSchema, Result>;
