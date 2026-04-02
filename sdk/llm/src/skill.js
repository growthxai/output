import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import matter from 'gray-matter';
import { tool } from 'ai';
import { z, ValidationError, FatalError } from '@outputai/core';

/**
 * Create an inline skill instruction package.
 *
 * @param {object} params
 * @param {string} params.name - Skill identifier
 * @param {string} [params.description] - When to use this skill (defaults to name)
 * @param {string} params.instructions - Full instructions returned when LLM calls load_skill
 * @returns {{ name: string, description: string, instructions: string }}
 */
export function skill( { name, description, instructions } ) {
  if ( !name ) {
    throw new ValidationError( 'skill() requires a name' );
  }
  if ( !instructions ) {
    throw new ValidationError( 'skill() requires instructions' );
  }
  return { name, description: description ?? name, instructions };
}

/**
 * Load a single skill from a markdown file.
 * Frontmatter may provide `name` and `description`; body becomes the instructions.
 *
 * @param {string} filePath - Absolute path to the .md skill file
 * @returns {{ name: string, description: string, instructions: string }}
 */
export const loadSkillFile = filePath => {
  const raw = readFileSync( filePath, 'utf-8' );
  const { data, content } = matter( raw );
  return {
    name: data.name ?? basename( filePath, '.md' ),
    description: data.description ?? basename( filePath, '.md' ),
    instructions: content.trim()
  };
};

/**
 * Load skills from an array of paths (files or directories of .md files).
 * Paths are resolved relative to `promptDir`.
 *
 * @param {string[]} skillPaths - Paths from prompt frontmatter (may be files or directories)
 * @param {string} promptDir - Base directory for resolving relative paths
 * @returns {{ name: string, description: string, instructions: string }[]}
 */
export const loadPromptSkills = ( skillPaths, promptDir ) => {
  const paths = Array.isArray( skillPaths ) ? skillPaths : [ skillPaths ];
  return paths.flatMap( skillPath => {
    const resolved = resolve( promptDir, skillPath );
    if ( !existsSync( resolved ) ) {
      throw new FatalError( `Skill path not found: "${skillPath}" (resolved to "${resolved}")` );
    }
    if ( statSync( resolved ).isDirectory() ) {
      return readdirSync( resolved )
        .filter( f => f.endsWith( '.md' ) )
        .sort()
        .map( f => loadSkillFile( join( resolved, f ) ) );
    }
    return [ loadSkillFile( resolved ) ];
  } );
};

/**
 * Load skills from a colocated `skills/` directory next to the prompt file.
 * Returns empty array if the directory doesn't exist or has no .md files.
 *
 * @param {string} promptDir - Directory containing the prompt file
 * @returns {{ name: string, description: string, instructions: string }[]}
 */
export const loadColocatedSkills = promptDir => {
  const skillsDir = resolve( promptDir, 'skills' );
  if ( !existsSync( skillsDir ) || !statSync( skillsDir ).isDirectory() ) {
    return [];
  }
  return loadPromptSkills( [ './skills/' ], promptDir );
};

/**
 * Build the skills system message content listing available skills.
 *
 * @param {{ name: string, description: string }[]} skills
 * @returns {string}
 */
export const buildSystemSkillsVar = skills =>
  'Available skills (use load_skill to get full instructions):\n' +
  skills.map( s => `- ${s.name}: ${s.description}` ).join( '\n' );

/**
 * Build the `load_skill` AI SDK tool that the LLM calls to retrieve full skill instructions.
 *
 * @param {{ name: string, instructions: string }[]} skills
 * @returns {import('ai').Tool}
 */
export const buildLoadSkillTool = skills => tool( {
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
