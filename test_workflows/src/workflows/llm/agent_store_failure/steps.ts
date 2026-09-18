import { step, z } from '@outputai/core';
import { Agent, type MessageStore } from '@outputai/llm';

/** Fails only on write, so the model call succeeds and the failure happens after it */
const brokenMessageStore = (): MessageStore => ( {
  getMessages: async () => [],
  addMessages: async () => {
    throw new Error( 'Message store is intentionally broken.' );
  }
} );

/**
 * Agent.generate persists messages after the response arrives, inside the metered call. The tokens
 * were already spent, so the llm trace node should carry usage and cost even though the step fails.
 */
export const generateWithBrokenStore = step( {
  name: 'generateWithBrokenStore',
  description: 'Fails while persisting messages, after the model already answered',
  outputSchema: z.string(),
  fn: async () => {
    const agent = new Agent( {
      prompt: 'store_failure@v1',
      messageStore: brokenMessageStore()
    } );

    const result = await agent.generate();
    return result.text;
  }
} );
