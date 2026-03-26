import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import matter from 'gray-matter';
import { ValidationError, FatalError } from '@outputai/core';
import { resolveInvocationDir } from '@outputai/core/sdk_utils';
import { loadContent, findContentDir } from './load_content.js';
import { generateText } from './ai_sdk.js';
import { Output } from 'ai';

export { skill } from './skill.js';

const readPromptFrontmatter = ( promptName, promptDir ) => {
  const fileName = `${promptName}.prompt`;
  const promptFileDir = findContentDir( fileName, promptDir );
  if ( !promptFileDir ) {
    throw new FatalError( `Prompt "${promptName}" not found in "${promptDir}"` );
  }
  const { data } = matter( loadContent( fileName, promptFileDir ) );
  return { data, promptFileDir };
};

const loadSkillFile = filePath => {
  const raw = readFileSync( filePath, 'utf-8' );
  const { data, content } = matter( raw );
  return {
    name: data.name ?? basename( filePath, '.md' ),
    description: data.description ?? basename( filePath, '.md' ),
    instructions: content.trim()
  };
};

const loadPromptSkills = ( skillPaths, promptDir ) => {
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
 * Skills declared in the prompt frontmatter (skills: [...]) are validated and loaded
 * synchronously at agent() call time (module load = worker startup).
 *
 * @param {object} params
 * @param {string} params.name - Agent identifier
 * @param {string} params.prompt - Prompt file name (e.g. 'my_agent@v1')
 * @param {string} [params.promptDir] - Override stack-resolved prompt directory
 * @param {object} [params.tools] - AI SDK tools available during the LLM loop
 * @param {Array|Function} [params.skills] - Inline skills or a function (input) => skills[]
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

  // Load + validate static skills from prompt frontmatter at definition time.
  // Any missing skill files throw FatalError here — caught at worker startup.
  const { data: frontmatter, promptFileDir } = readPromptFrontmatter( prompt, promptDir );
  const promptSkills = frontmatter.skills ? loadPromptSkills( frontmatter.skills, promptFileDir ) : [];

  // Pre-compute the merged skills at definition time for the static case.
  // For dynamic skills (function), a closure is created per-call at runtime.
  const mergedStaticSkills = Array.isArray( skills ) ? [ ...promptSkills, ...skills ] : null;

  return async input => {
    const result = await generateText( {
      prompt,
      promptDir,
      variables: toVariables( input ),
      skills: mergedStaticSkills ??
        ( () => Promise.resolve( skills( input ) ).then( s => [ ...promptSkills, ...s ] ) ),
      maxSteps,
      ...( Object.keys( tools ).length > 0 ? { tools } : {} ),
      ...( outputSchema ? { output: Output.object( { schema: outputSchema } ) } : {} ),
      ...rest
    } );

    return outputSchema ? result.output : result.result;
  };
}
