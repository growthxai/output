import { step, z } from '@outputai/core';
import { aiSdk, generateText } from '@outputai/core/llm';
import { workflowInputSchema, workflowOutputSchema } from './types.js';

const tierSize = 100_000;
const longContext = 'context '.repeat( 120_000 );

type GenerateTextResponse = Awaited<ReturnType<typeof generateText>>;

const summarize = ( response: GenerateTextResponse ) => {
  if ( !response.cost ) {
    throw new Error( 'Expected the LLM response to include calculated cost.' );
  }

  return {
    inputTokens: response.usage.inputTokens ?? 0,
    stepCount: response.steps.length,
    total: response.cost.total,
    items: response.cost.items
  };
};

const expandContext = aiSdk.tool( {
  description: 'Return a large context for the next model request',
  inputSchema: z.object( {} ),
  execute: async () => longContext
} );

export const exerciseTieredPricing = step( {
  name: 'exerciseTieredPricing',
  description: 'Produces direct and mixed-step Anthropic context-tier pricing',
  inputSchema: workflowInputSchema,
  outputSchema: workflowOutputSchema,
  fn: async () => {
    const direct = summarize( await generateText( {
      prompt: 'long_context@v1',
      variables: { longContext }
    } ) );
    const mixed = summarize( await generateText( {
      prompt: 'tool_loop@v1',
      tools: { expand_context: expandContext },
      toolChoice: { type: 'tool', toolName: 'expand_context' },
      stopWhen: aiSdk.isStepCount( 2 )
    } ) );

    if ( !direct.items.some( item => item.tier?.size === tierSize ) ) {
      throw new Error( `Expected direct request to cross the ${tierSize}-token pricing tier.` );
    }
    const mixedTokenItems = mixed.items.filter( item => item.group !== 'tools' );
    if (
      !mixedTokenItems.some( item => item.tier === undefined ) ||
      !mixedTokenItems.some( item => item.tier?.size === tierSize )
    ) {
      throw new Error( 'Expected the tool loop to contain both base and tiered token costs.' );
    }

    return { direct, mixed };
  }
} );
