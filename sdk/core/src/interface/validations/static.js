import * as z from 'zod';
import { isZodSchema } from './schema_utils.js';

/**
 * Error is thrown when the definition of a step/workflow has problems
 */
export class StaticValidationError extends Error {};

const refineSchema = ( value, ctx ) => {
  if ( !value || isZodSchema( value ) ) {
    return;
  }

  ctx.addIssue( {
    code: 'invalid_type',
    message: 'Schema must be a Zod schema'
  } );
};

export const executeInParallelSchema = z.object( {
  jobs: z.array( z.function() ),
  concurrency: z.number().min( 1 ).or( z.literal( Infinity ) ),
  onJobCompleted: z.function().optional()
} );

export const durationSchema = z.union( [ z.string().regex(
  /^(\d+)(ms|s|m|h|d)$/,
  'Expected duration like "500ms", "10s", "5m", "2h", or "1d"'
), z.number() ] );

export const prioritySchema = z.object( {
  fairnessKey: z.string().optional(),
  fairnessWeight: z.number().min( 0.0001 ).max( 1000 ).optional(),
  priorityKey: z.number().min( 1 ).optional()
} );

const baseSchema = z.strictObject( {
  name: z.string().regex( /^[a-z_][a-z0-9_]*$/i ),
  description: z.string().optional(),
  inputSchema: z.any().optional().superRefine( refineSchema ),
  outputSchema: z.any().optional().superRefine( refineSchema ),
  fn: z.function(),
  options: z.object( {
    activityOptions: z.strictObject( {
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
    } ).optional()
  } ).optional()
} );

const stepSchema = baseSchema;

const workflowSchema = baseSchema.extend( {
  aliases: z.array( z.string().regex( /^[a-z_][a-z0-9_]*$/i ) ).optional().default( [] ),
  options: baseSchema.shape.options.unwrap().extend( {
    disableTrace: z.boolean().optional().default( false )
  } ).optional()
} );

const evaluatorSchema = baseSchema.omit( { outputSchema: true } );

const httpRequestSchema = z.object( {
  url: z.url( { protocol: /^https?$/ } ),
  method: z.enum( [ 'GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE' ] ),
  payload: z.any().optional(),
  headers: z.record( z.string(), z.string() ).optional()
} );

const validateAgainstSchema = ( schema, args ) => {
  const result = schema.safeParse( args );
  if ( !result.success ) {
    throw new StaticValidationError( z.prettifyError( result.error ) );
  }
};

/**
 * Validate step payload
 *
 * @param {object} args - The step arguments
 * @throws {StaticValidationError} Throws if args are invalid
 */
export function validateStep( args ) {
  validateAgainstSchema( stepSchema, args );
};

/**
 * Validate evaluator payload
 *
 * @param {object} args - The evaluator arguments
 * @throws {StaticValidationError} Throws if args are invalid
 */
export function validateEvaluator( args ) {
  validateAgainstSchema( evaluatorSchema, args );
};

/**
 * Validate workflow payload
 *
 * @param {object} args - The workflow arguments
 * @throws {StaticValidationError} Throws if args are invalid
 */
export function validateWorkflow( args ) {
  validateAgainstSchema( workflowSchema, args );
};

/**
 * Validate request payload
 *
 * @param {object} args - The request arguments
 * @throws {StaticValidationError} Throws if args are invalid
 */
export function validateRequestPayload( args ) {
  validateAgainstSchema( httpRequestSchema, args );
};

/**
 * Validate executeInParallel
 *
 * @param {object} args - The request arguments
 * @throws {StaticValidationError} Throws if args are invalid
 */
export function validateExecuteInParallel( args ) {
  validateAgainstSchema( executeInParallelSchema, args );
};
