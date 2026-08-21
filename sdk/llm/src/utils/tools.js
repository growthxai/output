import { tool as createTool } from 'ai';
import { ValidationError, z } from '@outputai/core';
import { getProvider } from '../ai_provider.js';

/**
 * Build the `load_skill` AI SDK tool that the LLM calls to retrieve full skill instructions.
 *
 * @param {Skill[]} skills
 * @returns {import('ai').Tool}
 */
export const buildLoadSkillTool = skills => createTool( {
  description: 'Get detailed instructions for a named skill',
  inputSchema: z.object( { name: z.string().describe( 'Name of the skill to load' ) } ),
  execute: ( { name } ) => {
    const sk = skills.find( s => s.name === name );
    if ( !sk ) {
      return `Skill "${name}" not found. Available: ${skills.map( s => s.name ).join( ', ' )}`;
    }
    return sk.instructions;
  }
} );

const buildProviderError = ( prompt, suffix ) => `Provider "${prompt.config.provider}" used by prompt "${prompt.name}" does not support ${suffix}.`;

/** Load tools from a prompt provider. */
export const loadPromptTools = prompt => {
  const promptToolNames = Object.keys( prompt.config.tools ?? {} );
  if ( promptToolNames.length === 0 ) {
    return null;
  }

  const { tools } = getProvider( prompt.config.provider );
  if ( !tools ) {
    throw new ValidationError( buildProviderError( prompt, 'provider-specific tools' ) );
  }

  const missingTools = promptToolNames.filter( t => !Object.hasOwn( tools, t ) || typeof tools[t] !== 'function' );
  if ( missingTools.length > 0 ) {
    throw new ValidationError( buildProviderError( prompt, `these tools: ${missingTools.join( ', ' )}` ) );
  }

  const loadedTools = {};
  for ( const name of promptToolNames ) {
    loadedTools[name] = tools[name]( prompt.config.tools[name] );
  }
  return loadedTools;
};
