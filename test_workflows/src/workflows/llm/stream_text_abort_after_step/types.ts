import { z } from '@outputai/core';

export const workflowOutputSchema = z.object( {
  aborted: z.boolean(),
  finishedSteps: z.number(),
  sawAbortPart: z.boolean(),
  onEndCalled: z.boolean(),
  onErrorCalled: z.boolean()
} );

export type WorkflowOutput = z.infer<typeof workflowOutputSchema>;
