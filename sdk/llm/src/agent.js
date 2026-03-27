import { ValidationError } from '@outputai/core';
import { resolveInvocationDir } from '@outputai/core/sdk_utils';
import { generateText } from './ai_sdk.js';
import { Output } from 'ai';

export { skill } from './skill.js';

export function agent( { name, prompt, tools = {}, skills = [], outputSchema, maxSteps = 10, promptDir: explicitPromptDir, ...rest } ) {
  if ( !name ) {
    throw new ValidationError( 'agent() requires a name' );
  }
  if ( !prompt ) {
    throw new ValidationError( 'agent() requires a prompt' );
  }

  // Must be captured synchronously at definition time — async activity execution
  // breaks the call stack, so resolveInvocationDir() would fail if called lazily.
  const promptDir = explicitPromptDir ?? resolveInvocationDir();

  return async input => generateText( {
    prompt,
    promptDir,
    variables: input,
    skills,
    maxSteps,
    ...( Object.keys( tools ).length > 0 ? { tools } : {} ),
    ...( outputSchema ? { output: Output.object( { schema: outputSchema } ) } : {} ),
    ...rest
  } );
}
