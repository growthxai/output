import { z } from '@outputai/core';

export const searchResultSchema = z.object( {
  answer: z.string(),
  sources: z.array( z.object( {
    url: z.string(),
    title: z.string()
  } ) )
} );

export const nativeWebSearchOutputSchema = z.object( {
  anthropic: searchResultSchema,
  openai: searchResultSchema,
  openaiPreview: searchResultSchema
} );
