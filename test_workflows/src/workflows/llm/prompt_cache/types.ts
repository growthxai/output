import { z } from '@outputai/core';

export const cacheUsageSchema = z.object( {
  inputTokens: z.number().int().nonnegative(),
  noCacheTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative()
} );

export const workflowInputSchema = z.object( {} );

export const workflowOutputSchema = z.object( {
  seed: cacheUsageSchema,
  readWrite: cacheUsageSchema
} );

export type WorkflowInput = z.infer<typeof workflowInputSchema>;
export type WorkflowOutput = z.infer<typeof workflowOutputSchema>;
