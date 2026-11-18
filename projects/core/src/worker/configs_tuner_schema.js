import * as z from 'zod';

const coalesceEmptyString = v => v === '' ? undefined : v;

const durationSchema = z.preprocess(
  coalesceEmptyString,
  z.string()
    .regex( /^\d+$|^\d+(\.\d+)?\s?(ms|s|m|h|d)$/i )
    .optional()
);

const resourceBasedTunerOptionsSchema = z.strictObject( {
  targetMemoryUsage: z.number().min( 0 ).max( 1 ),
  targetCpuUsage: z.number().min( 0 ).max( 1 )
} );

const resourceBasedSlotOptionsSchema = z.strictObject( {
  minimumSlots: z.number().int().positive().optional(),
  maximumSlots: z.number().int().positive().optional(),
  rampThrottle: durationSchema
} ).superRefine( ( value, ctx ) => {
  if ( value.minimumSlots !== undefined && value.maximumSlots !== undefined && value.minimumSlots > value.maximumSlots ) {
    ctx.addIssue( {
      code: 'custom',
      message: 'minimumSlots must be less than or equal to maximumSlots'
    } );
  }
} );

const resourceBasedTunerSchema = z.strictObject( {
  tunerOptions: resourceBasedTunerOptionsSchema,
  workflowTaskSlotOptions: resourceBasedSlotOptionsSchema.optional(),
  activityTaskSlotOptions: resourceBasedSlotOptionsSchema.optional(),
  localActivityTaskSlotOptions: resourceBasedSlotOptionsSchema.optional(),
  nexusTaskSlotOptions: resourceBasedSlotOptionsSchema.optional()
} );

const fixedSizeSlotSupplierSchema = z.strictObject( {
  type: z.literal( 'fixed-size' ),
  numSlots: z.number().int().positive()
} );

const resourceBasedSlotSupplierSchema = resourceBasedSlotOptionsSchema.extend( {
  type: z.literal( 'resource-based' ),
  tunerOptions: resourceBasedTunerOptionsSchema
} );

const slotSupplierSchema = z.union( [
  fixedSizeSlotSupplierSchema,
  resourceBasedSlotSupplierSchema
] );

const tunerHolderSchema = z.strictObject( {
  workflowTaskSlotSupplier: slotSupplierSchema,
  activityTaskSlotSupplier: slotSupplierSchema,
  localActivityTaskSlotSupplier: slotSupplierSchema,
  nexusTaskSlotSupplier: slotSupplierSchema
} );

const workerTunerSchema = z.union( [
  resourceBasedTunerSchema,
  tunerHolderSchema
] );

export const workerTunerEnvSchema = z.preprocess(
  coalesceEmptyString,
  /* eslint-disable consistent-return */
  z.string().optional().transform( ( value, ctx ) => {
    if ( value === undefined ) {
      return undefined;
    }

    try {
      return JSON.parse( value );
    } catch ( error ) {
      ctx.addIssue( { code: 'custom', message: `Expected valid JSON: ${error.message}` } );
      return z.NEVER;
    }
  } ).pipe( workerTunerSchema.optional() )
  /* eslint-enable consistent-return */
);
