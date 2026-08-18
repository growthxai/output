import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import matter from 'gray-matter';
import { ValidationError } from '@outputai/core';

/**
 * @typedef Skill
 * @property {string} name
 * @property {string} description
 * @property {string} instructions
 */

/**
 * Recursive load skill files (.md).
 * Frontmatter may provide `name` and `description`; body becomes the instructions.
 *
 * @param {string[]} paths
 * @returns {Skills[]}
 */
export const recursiveLoadSkillFile = paths => {
  const loaded = [];
  for ( const path of paths ) {
    if ( !existsSync( path ) ) {
      throw new ValidationError( `Skill path "${path}" not found` );
    }
    if ( statSync( path ).isDirectory() ) {
      loaded.push( ...recursiveLoadSkillFile( readdirSync( path ).sort().map( f => resolve( path, f ) ) ) );
    }
    if ( !path.endsWith( '.md' ) ) {
      continue;
    }

    const raw = readFileSync( path, 'utf-8' );
    const { data, content } = matter( raw );
    loaded.push( {
      name: data.name ?? basename( path, '.md' ),
      description: data.description ?? basename( path, '.md' ),
      instructions: content.trim()
    } );
  }
  return loaded;
};

/**
 * Resolve all skills available to a prompt.
 *
 * @param {object} prompt - Loaded prompt object
 * @returns {{ name: string, description: string, instructions: string }[]}
 */
export const loadSkills = prompt => {
  const baseDir = prompt.fileDir;

  // skills referenced in the prompt config
  const promptSkillPaths = prompt.config.skills.map( f => resolve( baseDir, f ) );

  return recursiveLoadSkillFile( promptSkillPaths );
};
