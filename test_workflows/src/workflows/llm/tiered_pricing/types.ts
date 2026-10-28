import { z } from '@outputai/core';

const pricingTierSchema = z.object( {
  type: z.literal( 'context' ),
  size: z.number().int().positive()
} );

const costItemSchema = z.object( {
  group: z.enum( [ 'input', 'output', 'tools' ] ),
  label: z.string().nullable(),
  amount: z.number().nonnegative(),
  ppm: z.number().nullable(),
  total: z.number().nullable(),
  status: z.enum( [ 'ok', 'fallback', 'missing' ] ),
  tier: pricingTierSchema.optional()
} );

const callResultSchema = z.object( {
  inputTokens: z.number().int().nonnegative(),
  stepCount: z.number().int().positive(),
  total: z.number().nullable(),
  items: z.array( costItemSchema )
} );

export const workflowInputSchema = z.object( {} );

export const workflowOutputSchema = z.object( {
  direct: callResultSchema,
  mixed: callResultSchema
} );
