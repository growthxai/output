import { z } from '@outputai/core';

export const workflowInputSchema = z.object( {
  topic: z.string().describe( 'Topic to generate content about' )
} );

export const workflowOutputSchema = z.object( {
  content: z.string(),
  streamedContent: z.string(),
  chunkCount: z.number(),
  matches: z.boolean()
} );

export type WorkflowInput = z.infer<typeof workflowInputSchema>;
export type WorkflowOutput = z.infer<typeof workflowOutputSchema>;
