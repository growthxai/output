import { step, z } from '@outputai/core';
import { fetchBlogContent } from '../../clients/jina.js';

const blogContentSchema = z.object( {
  title: z.string(),
  url: z.string(),
  content: z.string(),
  tokenCount: z.number()
} );

export const fetchContent = step( {
  name: 'fetch_blog_content',
  description: 'Fetch blog content from URL using Jina Reader API',
  inputSchema: z.object( {
    url: z.string().url()
  } ),
  outputSchema: blogContentSchema,
  fn: async ( { url } ) => {
    const response = await fetchBlogContent( url );
    return {
      title: response.data.title,
      url: response.data.url,
      content: response.data.content,
      tokenCount: response.data.usage.tokens
    };
  }
} );
