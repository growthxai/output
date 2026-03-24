import { workflow, z } from '@outputai/core';
import { reviewContent } from './steps.js';
import { reviewOutputSchema } from './types.js';

export default workflow( {
  name: 'agent_demo',
  description: 'Demonstrates the agent() abstraction with file-based and inline skills',
  inputSchema: z.object( {
    content: z.string().describe( 'Content to review' ),
    content_type: z.string().default( 'documentation' ).describe( 'Type of content' ),
    focus: z.string().default( 'clarity and structure' ).describe( 'Review focus areas' )
  } ),
  outputSchema: reviewOutputSchema,
  fn: async input => reviewContent( input )
} );
