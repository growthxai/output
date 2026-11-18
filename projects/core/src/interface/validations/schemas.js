import * as z from 'zod';
import { EvaluationResult } from '../evaluation_result.js';

/**
 * Detects if a value behaves like a Zod v4 Classic/Mini schema.
 *
 * Zod v4 schemas from different package instances do not share the same
 * prototype, so `instanceof z.ZodType` is too fragile here. The `_zod`
 * property is the documented v4 runtime marker, and `safeParse` is required
 * because the validators call it directly.
 *
 * @param {unknown} schema - The schema to check
 * @returns {boolean} True if the schema is a Zod schema
 */
export const isZodSchema = schema =>
  Boolean(
    schema &&
    typeof schema === 'object' &&
    typeof schema._zod?.def?.type === 'string' &&
    typeof schema.safeParse === 'function'
  );

const refineSchema = ( value, ctx ) => {
  if ( !value || isZodSchema( value ) ) {
    return;
  }

  ctx.addIssue( {
    code: 'invalid_type',
    message: 'Schema must be a Zod schema'
  } );
};

const durationSchema = z.union( [ z.string().regex(
  /^(\d+)(ms|s|m|h|d)$/,
  'Expected duration like "500ms", "10s", "5m", "2h", or "1d"'
), z.number() ] );

const prioritySchema = z.object( {
  fairnessKey: z.string().optional(),
  fairnessWeight: z.number().min( 0.0001 ).max( 1000 ).optional(),
  priorityKey: z.number().min( 1 ).optional()
} );

const activityOptionsSchema = z.strictObject( {
  activityId: z.string().optional(),
  cancellationType: z.enum( [ 'TRY_CANCEL', 'WAIT_CANCELLATION_COMPLETED', 'ABANDON' ] ).optional(),
  heartbeatTimeout: durationSchema.optional(),
  priority: prioritySchema.optional(),
  retry: z.strictObject( {
    initialInterval: durationSchema.optional(),
    backoffCoefficient: z.number().gte( 1 ).optional(),
    maximumInterval: durationSchema.optional(),
    maximumAttempts: z.number().gte( 1 ).int().optional(),
    nonRetryableErrorTypes: z.array( z.string() ).optional()
  } ).optional(),
  scheduleToCloseTimeout: durationSchema.optional(),
  scheduleToStartTimeout: durationSchema.optional(),
  startToCloseTimeout: durationSchema.optional(),
  summary: z.string().optional()
} );

const baseSchema = z.strictObject( {
  name: z.string().regex( /^[a-z_][a-z0-9_]*$/i ),
  description: z.string().optional(),
  inputSchema: z.any().optional().superRefine( refineSchema ),
  outputSchema: z.any().optional().superRefine( refineSchema ),
  fn: z.function(),
  options: z.object( {
    activityOptions: activityOptionsSchema.optional()
  } ).optional()
} );

export const stepSchema = baseSchema;

export const workflowSchema = baseSchema.extend( {
  aliases: z.array( z.string().regex( /^[a-z_][a-z0-9_]*$/i ) ).optional().default( [] ),
  options: baseSchema.shape.options.unwrap().extend( {
    disableTrace: z.boolean().optional().default( false )
  } ).optional()
} );

export const evaluatorSchema = baseSchema.omit( { outputSchema: true } );

export const evaluatorOutputSchema = z.instanceof( EvaluationResult );

export const httpRequestSchema = z.object( {
  url: z.url( { protocol: /^https?$/ } ),
  method: z.enum( [ 'GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE' ] ),
  payload: z.any().optional(),
  headers: z.record( z.string(), z.string() ).optional(),
  responseOptions: z.strictObject( {
    includeHeaders: z.boolean().optional().default( false ),
    includeBody: z.boolean().optional().default( false )
  } ).optional()
} );

export const workflowInvocationOptionsSchema = z.strictObject( {
  detached: z.boolean().optional(),
  activityOptions: activityOptionsSchema.optional(),
  context: z.object( {
    control: z.object( {
      continueAsNew: z.function().optional(),
      isContinueAsNewSuggested: z.function().optional()
    } ).loose().optional(),
    info: z.object( {
      workflowId: z.string().optional(),
      runId: z.string().optional()
    } ).loose().optional()
  } ).loose().optional()
} ).optional();

export const executeInParallelSchema = z.object( {
  jobs: z.array( z.function() ),
  concurrency: z.number().min( 1 ).or( z.literal( Infinity ) ),
  onJobCompleted: z.function().optional()
} );
