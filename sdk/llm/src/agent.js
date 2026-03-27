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
