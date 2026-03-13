import type { z } from 'zod';
import type { DeepPartial, AnyZodSchema, TemporalActivityOptions } from './types.d.ts';

/**
 * The second argument passed to the workflow's `fn` function.
 */
export type WorkflowContext<
  InputSchema extends AnyZodSchema | undefined = undefined,
  OutputSchema extends AnyZodSchema | undefined = undefined
> = {

  /**
   * Functions that allow fine control over the underlying Temporal workflows
   */
  control: {
    /**
     * Closes the current workflow execution successfully and creates a new workflow execution.
     *
     * The new workflow execution is in the same chain as the previous workflow, but it generates another trace file.
     *
     * It acts as a checkpoint when the workflow gets too long or approaches certain scaling limits.
     *
     * It accepts input with the same schema as the parent workflow function (`inputSchema`).
     *
     * Calling this function must be the last statement in the workflow, accompanied by a `return`:
     *
     * @example
     * ```js
     *   return control.continueAsNew();
     * ```
     * Upon returning, the parent workflow execution closes without any output, and the new execution takes its place.
     *
     * The function's return type matches `outputSchema`; although no value is returned, the execution is replaced.
     *
     * @see {@link https://docs.temporal.io/develop/typescript/continue-as-new}
     *
     * @param input - The input for the new run. Omit when the workflow has no input schema.
     * @returns The workflow output type for type-checking; never returns at runtime.
     */
    continueAsNew: InputSchema extends AnyZodSchema ?
      ( input: z.infer<InputSchema> ) => ( OutputSchema extends AnyZodSchema ? z.infer<OutputSchema> : void ) :
      () => ( OutputSchema extends AnyZodSchema ? z.infer<OutputSchema> : void ),

    /**
     * Indicates whether the Temporal runtime suggests continuing this workflow as new.
     *
     * Use this to decide whether to `continueAsNew` before long waits or at loop boundaries.
     * Prefer returning the `continueAsNew(...)` call immediately when this becomes `true`.
     *
     * @see {@link https://docs.temporal.io/develop/typescript/continue-as-new#how-to-test}
     *
     * @returns True if a continue-as-new is suggested for the current run; otherwise false.
     */
    isContinueAsNewSuggested: () => boolean,
  },

  /**
   * Information about the workflow execution
   */
  info: {
    /**
     * Internal Temporal workflow id.
     *
     * @see {@link https://docs.temporal.io/workflow-execution/workflowid-runid#workflow-id}
     */
    workflowId: string
  }
};

/**
 * Configuration for workflow invocations.
 *
 * Allows overriding Temporal Activity options for this workflow.
 */
export type WorkflowInvocationConfiguration<Context extends WorkflowContext = WorkflowContext> = {

  /**
   * Temporal activity options for this invocation (overrides the workflow's default activity options).
   */
  options?: TemporalActivityOptions,

  /**
   * Configures whether this workflow runs detached.
   * Detached workflows called without explicitly awaiting the result are "fire-and-forget" and may outlive the parent.
   */
  detached?: boolean,

  /**
   * Allow to overwrite properties of the "context" of workflows when called in tests environments.
   */
  context?: DeepPartial<Context>
};

/**
 * Options for a workflow.
 */
export type WorkflowOptions = {

  /**
   * Temporal activity options for activities invoked by this workflow.
   */
  activityOptions?: TemporalActivityOptions,

  /**
   * When `true`, disables trace file generation for this workflow. Only has effect when tracing is enabled.
   */
  disableTrace?: boolean
};

/**
 * The handler function of a workflow.
 *
 * @param input - The workflow input; it matches the schema defined by `inputSchema`.
 * @param context - A context object with tools and information.
 *
 * @returns A value matching the schema defined by `outputSchema`.
 */
export type WorkflowFunction<
  InputSchema extends AnyZodSchema | undefined = undefined,
  OutputSchema extends AnyZodSchema | undefined = undefined
> = InputSchema extends AnyZodSchema ?
  ( input: z.infer<InputSchema>, context: WorkflowContext<InputSchema, OutputSchema> ) =>
  Promise<OutputSchema extends AnyZodSchema ? z.infer<OutputSchema> : void> :
  ( input?: undefined | null, context: WorkflowContext<InputSchema, OutputSchema> ) =>
  Promise<OutputSchema extends AnyZodSchema ? z.infer<OutputSchema> : void>;

/**
 * A wrapper around the user defined `fn` handler function.
 *
 * It accepts the same input and returns the same value, calling the user function inside.
 *
 * The second argument is a WorkflowInvocationConfiguration object, allowing workflows configuration overwrite.
 *
 * It adds input and output validation based on the `inputSchema`, `outputSchema`.
 *
 * @param input - The workflow input; it matches the schema defined by `inputSchema`.
 * @param config - Additional configuration for the invocation.
 * @returns A value matching the schema defined by `outputSchema`.
 */
export type WorkflowFunctionWrapper<WorkflowFunction> =
  [Parameters<WorkflowFunction>[0]] extends [undefined | null] ?
    ( input?: undefined | null, config?: WorkflowInvocationConfiguration<Parameters<WorkflowFunction>[1]> ) =>
    ReturnType<WorkflowFunction> :
    ( input: Parameters<WorkflowFunction>[0], config?: WorkflowInvocationConfiguration<Parameters<WorkflowFunction>[1]> ) =>
    ReturnType<WorkflowFunction>;

/**
 * Creates a workflow.
 *
 * A workflow is an orchestration of one or more steps. It is translated to a Temporal Workflow.
 *
 * The workflow logic is defined in the `fn` handler function.
 *
 * The schema of the input that the function receives as the first argument is defined by `inputSchema`.
 *
 * The output of the `fn` handler must match `outputSchema`; otherwise, a validation error is raised.
 *
 * @remarks
 * - Workflows should respect the same limitations as Temporal workflows.
 * - Workflows can invoke steps or evaluators and cannot perform I/O directly.
 * - The workflow `name` needs to be unique across all workflows in the project.
 *
 * @example
 * ```
 * import { step } from './my_steps.ts';
 *
 * workflow( {
 *   name: 'main',
 *   description: 'A generic workflow',
 *   inputSchema: z.object( {
 *     value: z.number()
 *   } ),
 *   outputSchema: z.string(),
 *   fn: async input => {
 *     const result = await step( input.value );
 *     return result as string;
 *   }
 * } )
 * ```
 *
 * @example Workflow without outputSchema
 * ```
 * import { step } from './my_steps.ts';
 *
 * workflow( {
 *   name: 'main',
 *   description: 'A generic workflow',
 *   inputSchema: z.object( {
 *     value: z.number()
 *   } ),
 *   fn: async input => {
 *     await step( input.value );
 *   }
 * } )
 * ```
 *
 * @example Workflow without inputSchema
 * ```
 * import { step } from './my_steps.ts';
 *
 * workflow( {
 *   name: 'main',
 *   description: 'A generic workflow',
 *   outputSchema: z.string(),
 *   fn: async () => {
 *     const result = await step();
 *     return result as string;
 *   }
 * } )
 * ```
 *
 * @example Workflow without inputSchema and outputSchema
 * ```
 * import { step } from './my_steps.ts';
 *
 * workflow( {
 *   name: 'main',
 *   description: 'A generic workflow',
 *   fn: async () => {
 *     await step();
 *   }
 * } )
 * ```
 *
 * @example Using continueAsNew
 * The function `continueAsNew` (same as Temporal) can be used to create a new workflow with the same ID and pass different input.
 *
 * ```
 * import { step } from './my_steps.ts';
 *
 * workflow( {
 *   name: 'main',
 *   description: 'A generic workflow',
 *   inputSchema: z.object( {
 *     value: z.number()
 *   } ),
 *   outputSchema: z.string(),
 *   fn: async ( input, context ) => {
 *     const result = await step( input.value );
 *     if ( context.control.isContinueAsNewSuggested() ) {
 *       return context.control.continueAsNew( input );
 *     }
 *
 *     return result as string;
 *   }
 * } )
 * ```
 * @typeParam InputSchema - Zod schema of the fn's input.
 * @typeParam OutputSchema - Zod schema of the fn's return.
 *
 * @throws {@link ValidationError}
 * @throws {@link FatalError}
 *
 * @param params - Workflow parameters
 * @param params.name - Human-readable workflow name (must start with a letter or underscore, followed by letters, numbers, or underscores).
 * @param params.description - Description of the workflow
 * @param params.inputSchema - Zod schema for workflow input
 * @param params.outputSchema - Zod schema for workflow output
 * @param params.fn - A function containing the workflow code
 * @param params.options - Optional workflow options.
 * @returns The same handler function set at `fn` with a different signature
 */
export declare function workflow<
  InputSchema extends AnyZodSchema | undefined = undefined,
  OutputSchema extends AnyZodSchema | undefined = undefined
>( params: {
  name: string;
  description?: string;
  inputSchema?: InputSchema;
  outputSchema?: OutputSchema;
  fn: WorkflowFunction<InputSchema, OutputSchema>;
  options?: WorkflowOptions;
} ): WorkflowFunctionWrapper<WorkflowFunction<InputSchema, OutputSchema>>;
