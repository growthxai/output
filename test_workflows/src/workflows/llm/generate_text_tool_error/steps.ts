import { step, z } from '@outputai/core';
import { aiSdk, generateText } from '@outputai/llm';

/** Throws on execution, after the step that requested it already reported its usage */
const lookupPrice = aiSdk.tool( {
  description: 'Look up the price of a part',
  inputSchema: z.object( { part: z.string() } ),
  execute: async (): Promise<string> => {
    throw new Error( 'Price lookup is intentionally broken.' );
  }
} );

/**
 * Exercises a tool loop that breaks mid-run. Whether the sdk fails the call or turns the throw into
 * a tool error result, the first step is already paid for, so the trace must show its usage.
 */
export const generateWithBrokenTool = step( {
  name: 'generateWithBrokenTool',
  description: 'Runs a generation whose tool throws during execution',
  outputSchema: z.string(),
  fn: async () => {
    const result = await generateText( {
      prompt: 'tool_error@v1',
      toolChoice: 'auto',
      tools: { lookup_price: lookupPrice }
    } );

    return result.text;
  }
} );
