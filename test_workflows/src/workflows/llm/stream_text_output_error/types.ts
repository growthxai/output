import { z } from '@outputai/core';

export const workflowOutputSchema = z.object( {
  failed: z.boolean(),
  errorName: z.string(),
  onEndCalled: z.boolean(),
  onErrorCalled: z.boolean(),
  finishedSteps: z.number()
} );

export type WorkflowOutput = z.infer<typeof workflowOutputSchema>;
