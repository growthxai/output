import { z } from '@outputai/core';

export const sourceSchema = z.object( {
  url: z.string(),
  title: z.string()
} );

export const searchOutputSchema = z.object( {
  answer: z.string(),
  sources: z.array( sourceSchema )
} );
