import { z } from '@outputai/core';

export const workflowInputSchema = z.object( {
  urls: z.array( z.string().url() ),
  delayMs: z.number().int().positive().optional().default( 100 )
} );

export const workflowOutputSchema = z.object( {
  processed: z.number()
} );

export const processUrlOutputSchema = z.object( {
  url: z.string(),
  timestamp: z.number()
} );

export type WorkflowInput = z.infer<typeof workflowInputSchema>;
export type WorkflowOutput = z.infer<typeof workflowOutputSchema>;
export type ProcessUrlOutput = z.infer<typeof processUrlOutputSchema>;
