import { ValidationError } from '@outputai/core';
import { resolveInvocationDir } from '@outputai/core/sdk_utils';
import { ToolLoopAgent } from './tool_loop_agent.js';
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

  const inner = ToolLoopAgent( {
    prompt,
    promptDir,
    skills,
    tools,
    maxSteps,
    ...( outputSchema ? { output: Output.object( { schema: outputSchema } ) } : {} ),
    ...rest
  } );

  return async input => inner.generate( { variables: input } );
}
