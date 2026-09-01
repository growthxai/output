import { z } from '@outputai/core';

export const workflowOutputSchema = z.object( {
  aborted: z.boolean(),
  sawAbortPart: z.boolean(),
  onEndCalled: z.boolean(),
  onErrorCalled: z.boolean(),
  chunksBeforeAbort: z.number(),
  abortReason: z.string()
} );

export type WorkflowOutput = z.infer<typeof workflowOutputSchema>;
