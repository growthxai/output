import { tool as createTool } from 'ai';
import { z } from '@outputai/core';

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
