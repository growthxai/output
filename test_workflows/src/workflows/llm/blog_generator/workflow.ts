import { workflow, z } from '@outputai/core';
import { generateBlogPost } from './steps.js';

export default workflow( {
  name: 'blog_generator',
  description: 'Generate a blog post from a user request',
  inputSchema: z.object( {
    topic: z.string(),
    requirements: z.string().optional()
  } ),
  outputSchema: z.object( {
    title: z.string(),
    blog_post: z.string(),
    word_count: z.number()
  } ),
  fn: async ( { topic, requirements } ) => {
    return generateBlogPost( { topic, requirements } );
  }
} );
