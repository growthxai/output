import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
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
 * Recursively load skill paths. Explicit files may use any extension; directories load `.md` files only.
 * Frontmatter may provide `name` and `description`; body becomes the instructions.
 *
 * @param {string[]} paths
 * @param {boolean} markdownFilesOnly
 * @returns {Skills[]}
 */
const recursiveLoadSkillPaths = ( paths, markdownFilesOnly ) => {
  const loaded = [];
  for ( const path of paths ) {
    if ( !existsSync( path ) ) {
      throw new ValidationError( `Skill path "${path}" not found` );
    }
    const stats = lstatSync( path );
    if ( stats.isSymbolicLink() ) {
      continue;
    }
    if ( stats.isDirectory() ) {
      loaded.push( ...recursiveLoadSkillPaths(
        readdirSync( path ).sort().map( f => resolve( path, f ) ),
        true
      ) );
      continue;
    }
    if ( markdownFilesOnly && !path.endsWith( '.md' ) ) {
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
 * Recursively load skill files without following symbolic links.
 *
 * @param {string[]} paths
 * @returns {Skills[]}
 */
export const recursiveLoadSkillFile = paths => recursiveLoadSkillPaths( paths, false );

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
