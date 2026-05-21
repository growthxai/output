import { step, z } from '@outputai/core';
import { generateText } from '@outputai/llm';

const answerSchema = z.object( {
  question: z.string(),
  answer: z.string(),
  cacheReadInputTokens: z.number().optional(),
  cacheCreationInputTokens: z.number().optional()
} );

export const answerFromDocument = step( {
  name: 'answerFromDocument',
  description: 'Answer a single question about the document. The static system prompt and document are cached.',
  inputSchema: z.object( {
    document: z.string(),
    question: z.string()
  } ),
  outputSchema: answerSchema,
  fn: async ( { document, question }: { document: string; question: string } ) => {
    const response = await generateText( {
      prompt: 'answer@v1',
      variables: { document, question }
    } );

    const anthropicMeta = response.providerMetadata?.anthropic as {
      cacheReadInputTokens?: number;
      cacheCreationInputTokens?: number;
    } | undefined;

    return {
      question,
      answer: response.result,
      cacheReadInputTokens: anthropicMeta?.cacheReadInputTokens,
      cacheCreationInputTokens: anthropicMeta?.cacheCreationInputTokens
    };
  }
} );
