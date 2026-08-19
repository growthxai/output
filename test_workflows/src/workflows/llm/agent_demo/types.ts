import { z } from '@outputai/core';

export const reviewOutputSchema = z.object( {
  issues: z.array( z.string() ).describe( 'Specific problems found in the content' ),
  suggestions: z.array( z.string() ).describe( 'Actionable improvement suggestions' ),
  score: z.number().describe( 'Overall quality score 1-10' ),
  summary: z.string().describe( 'One paragraph summary of the review' )
} );

export const reviewInputSchema = z.object( {
  content: z.string().describe( 'The content to review' ),
  content_type: z.string().describe( 'Type of content (e.g. documentation, tutorial, README)' ),
  focus: z.string().describe( 'What aspects to focus the review on' )
} );

export const streamedReviewOutputSchema = z.object( {
  content: z.string(),
  streamedContent: z.string(),
  chunkCount: z.number(),
  matches: z.boolean(),
  storedMessageCount: z.number()
} );

export const streamReviewOutputSchema = z.object( {
  content: z.string(),
  chunkCount: z.number()
} );

export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
