import { z } from '@outputai/core';

export const workflowOutputSchema = z.object( {
  failed: z.boolean(),
  errorName: z.string(),
  errorMessage: z.string(),
  isMasked: z.boolean()
} );

export type WorkflowOutput = z.infer<typeof workflowOutputSchema>;
