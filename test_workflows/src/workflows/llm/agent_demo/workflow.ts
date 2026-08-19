import { workflow, z } from '@outputai/core';
import {
  reviewContent,
  reviewContentFreeform,
  reviewContentGenerateText,
  reviewContentGenerateWithStreaming,
  reviewContentNoSkills,
  reviewContentStream
} from './steps.js';
import { reviewOutputSchema, streamReviewOutputSchema, streamedReviewOutputSchema } from './types.js';

export default workflow( {
  name: 'agent_demo',
  description: 'Demonstrates Agent generate, generateWithStreaming, and stream, plus generateText with prompt skills',
  inputSchema: z.object( {
    content: z.string().describe( 'Content to review' ),
    content_type: z.string().default( 'documentation' ).describe( 'Type of content' ),
    focus: z.string().default( 'clarity and structure' ).describe( 'Review focus areas' )
  } ),
  outputSchema: z.object( {
    structured: reviewOutputSchema,
    freeform: z.string(),
    generateText: z.string(),
    noSkills: z.string(),
    generateWithStreaming: streamedReviewOutputSchema,
    stream: streamReviewOutputSchema
  } ),
  fn: async input => ( {
    structured: await reviewContent( input ),
    freeform: await reviewContentFreeform( input ),
    generateText: await reviewContentGenerateText( input ),
    noSkills: await reviewContentNoSkills( input ),
    generateWithStreaming: await reviewContentGenerateWithStreaming( input ),
    stream: await reviewContentStream( input )
  } )
} );
