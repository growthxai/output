import { step, z } from '@outputai/core';
import { generateText, Output } from '@outputai/llm';

const blogOutputSchema = z.object( {
  title: z.string(),
  blog_post: z.string(),
  word_count: z.number()
} );

export const generateBlogPost = step( {
  name: 'generateBlogPost',
  description: 'Generate a blog post using an LLM',
  inputSchema: z.object( {
    topic: z.string(),
    requirements: z.string().optional()
  } ),
  outputSchema: blogOutputSchema,
  fn: async ( { topic, requirements }: { topic: string; requirements?: string } ) => {
    const { output } = await generateText( {
      prompt: 'generate_blog@v1',
      variables: { topic, requirements: requirements ?? '' },
      output: Output.object( { schema: blogOutputSchema } )
    } );
    return output;
  }
} );
