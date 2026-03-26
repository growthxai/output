import { ValidationError } from '@outputai/core';
import { resolveInvocationDir } from '@outputai/core/sdk_utils';
import { generateText } from './ai_sdk.js';
import { Output } from 'ai';

export { skill } from './skill.js';

const toVariables = input => {
  if ( !input ) {
    return {};
  }
  return Object.fromEntries(
    Object.entries( input ).map( ( [ k, v ] ) =>
      [ k, [ 'string', 'number', 'boolean' ].includes( typeof v ) ? v : JSON.stringify( v ) ]
    )
  );
};

/**
 * Create a reusable agent function that composes generateText() with skills and tools.
 *
 * The returned function is a plain async function — wrap it in step() for Temporal durability.
 *
 * Skill loading (frontmatter + inline/dynamic) is handled entirely by generateText.
 *
 * @param {object} params
 * @param {string} params.name - Agent identifier
 * @param {string} params.prompt - Prompt file name (e.g. 'my_agent@v1')
 * @param {string} [params.promptDir] - Override stack-resolved prompt directory
 * @param {object} [params.tools] - AI SDK tools available during the LLM loop
 * @param {Array|Function} [params.skills] - Inline skills or a function (variables) => skills[]
 * @param {import('zod').ZodSchema} [params.outputSchema] - Zod schema for structured output
 * @param {number} [params.maxSteps] - Max tool-loop iterations (default: 10)
 * @returns {Function} Async function: (input) => Promise<string | outputSchema>
 */
export function agent( {
  name,
  prompt,
  tools = {},
  skills = [],
  outputSchema,
  maxSteps = 10,
  promptDir: explicitPromptDir,
  ...rest
} ) {
  if ( !name ) {
    throw new ValidationError( 'agent() requires a name' );
  }
  if ( !prompt ) {
    throw new ValidationError( 'agent() requires a prompt' );
  }

  // Capture promptDir synchronously before any async work (stack frame must be intact)
  const promptDir = explicitPromptDir ?? resolveInvocationDir();

  return async input => {
    const result = await generateText( {
      prompt,
      promptDir,
      variables: toVariables( input ),
      skills,
      maxSteps,
      ...( Object.keys( tools ).length > 0 ? { tools } : {} ),
      ...( outputSchema ? { output: Output.object( { schema: outputSchema } ) } : {} ),
      ...rest
    } );

    return outputSchema ? result.output : result.result;
  };
}
