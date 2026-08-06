import type { z } from 'zod';
import type { AnyZodSchema, TemporalActivityOptions } from './types.d.ts';

/**
 * Options for a step.
 */
export type StepOptions = {

  /**
   * Temporal activity options for this step.
   */
  activityOptions?: TemporalActivityOptions
};

/**
 * The handler function of a step.
 *
 * @param input - Parsed step input (`z.infer<inputSchema>`).
 *
 * @returns A value accepted by `outputSchema` before parse (`z.input<outputSchema>`).
 */
export type StepFunction<
  InputSchema extends AnyZodSchema | undefined = undefined,
  OutputSchema extends AnyZodSchema | undefined = undefined
> = InputSchema extends AnyZodSchema ?
  ( input: z.infer<InputSchema> ) => Promise<OutputSchema extends AnyZodSchema ? z.input<OutputSchema> : void> :
  () => Promise<OutputSchema extends AnyZodSchema ? z.input<OutputSchema> : void>;

/**
 * A wrapper around the user defined `fn` handler function.
 *
 * Callers pass values accepted by `inputSchema` (`z.input`). The wrapper parses input,
 * invokes `fn`, parses output, and returns `z.infer<outputSchema>`.
 *
 * @param input - The step input before `inputSchema` parse.
 * @returns The step output after `outputSchema` parse.
 */
export type StepFunctionWrapper<
  InputSchema extends AnyZodSchema | undefined = undefined,
  OutputSchema extends AnyZodSchema | undefined = undefined
> = InputSchema extends AnyZodSchema ?
  ( input: z.input<InputSchema> ) => Promise<OutputSchema extends AnyZodSchema ? z.infer<OutputSchema> : void> :
  () => Promise<OutputSchema extends AnyZodSchema ? z.infer<OutputSchema> : void>;

/**
 * Creates a step.
 *
 * A step is a logical unit of work that can perform I/O. It is translated to a Temporal Activity.
 *
 * The step logic is defined in the `fn` handler function.
 *
 * The schema of the input that the function receives as the first argument is defined by the `inputSchema` option.
 *
 * The output of the `fn` handler must match the schema defined by `outputSchema`; otherwise, a validation error is raised.
 *
 * @example
 * ```
 * step( {
 *   name: 'process',
 *   description: 'A generic process',
 *   inputSchema: z.object( {
 *     value: z.number()
 *   } ),
 *   outputSchema: z.string(),
 *   fn: async input => {
 *     const result = await ai.call( input.value );
 *     return result as string;
 *   }
 * } )
 * ```
 *
 * @example Step without outputSchema
 * ```
 * step( {
 *   name: 'process',
 *   description: 'A generic process',
 *   inputSchema: z.object( {
 *     value: z.number()
 *   } ),
 *   fn: async input => {
 *     await ai.call( input.value );
 *   }
 * } )
 * ```
 *
 * @example Step without inputSchema
 * ```
 * step( {
 *   name: 'process',
 *   description: 'A generic process',
 *   outputSchema: z.string(),
 *   fn: async () => {
 *     const result = await ai.call();
 *     return result as string;
 *   }
 * } )
 * ```
 *
 * @example Step without inputSchema and outputSchema
 * ```
 * step( {
 *   name: 'process',
 *   description: 'A generic process',
 *   fn: async () => {
 *     await ai.call();
 *   }
 * } )
 * ```
 *
 * @remarks
 * - Never call another step from within a step.
 * - Never call a workflow from within a step.
 *
 * @typeParam InputSchema - Zod schema of the fn's input.
 * @typeParam OutputSchema - Zod schema of the fn's return.
 *
 * @throws {@link ValidationError}
 * @throws {@link FatalError}
 *
 * @param params - Step parameters
 * @param params.name - Human-readable step name (must start with a letter or underscore, followed by letters, numbers, or underscores)
 * @param params.description - Description of the step
 * @param params.inputSchema - Zod schema for the `fn` input
 * @param params.outputSchema - Zod schema for the `fn` output
 * @param params.fn - A handler function containing the step code
 * @param params.options - Optional step options.
 * @returns A wrapper that parses input/output around `fn`
 */
export declare function step<
  InputSchema extends AnyZodSchema | undefined = undefined,
  OutputSchema extends AnyZodSchema | undefined = undefined
>( params: {
  name: string;
  description?: string;
  inputSchema?: InputSchema;
  outputSchema?: OutputSchema;
  fn: StepFunction<InputSchema, OutputSchema>;
  options?: StepOptions;
} ): StepFunctionWrapper<InputSchema, OutputSchema>;
