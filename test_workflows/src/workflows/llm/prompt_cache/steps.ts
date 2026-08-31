import { step } from '@outputai/core';
import { generateText } from '@outputai/llm';
import { workflowInputSchema, workflowOutputSchema } from './types.js';

const stablePrefix = 'cacheable context '.repeat( 5_000 );
const additionalPrefix = 'additional cacheable context '.repeat( 1_000 );

type GenerateTextResponse = Awaited<ReturnType<typeof generateText>>;

const extractCacheUsage = ( response: GenerateTextResponse ) => ( {
  inputTokens: response.usage.inputTokens ?? 0,
  noCacheTokens: response.usage.inputTokenDetails?.noCacheTokens ?? 0,
  cacheReadTokens: response.usage.inputTokenDetails?.cacheReadTokens ?? 0,
  cacheWriteTokens: response.usage.inputTokenDetails?.cacheWriteTokens ?? 0
} );

export const exercisePromptCache = step( {
  name: 'exercisePromptCache',
  description: 'Seeds an Anthropic prompt cache, then reads it while writing an extended prefix',
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema,
  fn: async () => {
    const seedResponse = await generateText( {
      prompt: 'seed@v1',
      variables: { stablePrefix }
    } );
    const seed = extractCacheUsage( seedResponse );

    if ( seed.cacheWriteTokens === 0 ) {
      throw new Error( 'The seed request did not write prompt-cache tokens.' );
    }

    const readWriteResponse = await generateText( {
      prompt: 'read_write@v1',
      variables: { stablePrefix, additionalPrefix }
    } );
    const readWrite = extractCacheUsage( readWriteResponse );

    if ( readWrite.cacheReadTokens === 0 || readWrite.cacheWriteTokens === 0 ) {
      throw new Error(
        `Expected cache reads and writes, received read=${readWrite.cacheReadTokens}, write=${readWrite.cacheWriteTokens}.`
      );
    }

    return { seed, readWrite };
  }
} );
