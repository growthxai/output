import { z } from '@outputai/core';

export const reviewOutputSchema = z.object( {
  issues: z.array( z.string() ).describe( 'Specific problems found in the content' ),
  suggestions: z.array( z.string() ).describe( 'Actionable improvement suggestions' ),
  score: z.number().describe( 'Overall quality score 1-10' ),
  summary: z.string().describe( 'One paragraph summary of the review' )
} );

export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
