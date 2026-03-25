import { ValidationError } from '@outputai/core';

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
