import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import matter from 'gray-matter';
import { z, ValidationError, FatalError } from '@outputai/core';
import { resolveInvocationDir } from '@outputai/core/sdk_utils';
import { loadContent } from './load_content.js';
import { generateText } from './ai_sdk.js';
import { tool, stepCountIs, Output } from 'ai';

// ─── skill() factory ──────────────────────────────────────────────────────────

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

// ─── Internal helpers ─────────────────────────────────────────────────────────

const readPromptFrontmatter = ( promptName, promptDir ) => {
  const content = loadContent( `${promptName}.prompt`, promptDir );
  if ( !content ) {
    throw new FatalError( `Prompt "${promptName}" not found in "${promptDir}"` );
  }
  const { data } = matter( content );
  return data;
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

// Validate + load skill file paths declared in prompt frontmatter.
// Runs synchronously at agent() definition time — fails fast at worker startup.
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

const buildSystemSkillsVar = skills =>
  'Available skills (use load_skill to get full instructions):\n' +
  skills.map( s => `- ${s.name}: ${s.description}` ).join( '\n' );

const buildLoadSkillTool = skills => tool( {
  description: 'Get detailed instructions for a named skill',
  inputSchema: z.object( { name: z.string().describe( 'Name of the skill to load' ) } ),
  execute: async ( { name } ) => {
    const sk = skills.find( s => s.name === name );
    if ( !sk ) {
      return `Skill "${name}" not found. Available: ${skills.map( s => s.name ).join( ', ' )}`;
    }
    return sk.instructions;
  }
} );

const toVariables = input => {
  if ( !input ) {
    return {};
  }
  return Object.fromEntries(
    Object.entries( input ).map( ( [ k, v ] ) =>
      [ k, ( typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ) ? v : JSON.stringify( v ) ]
    )
  );
};

// ─── agent() factory ──────────────────────────────────────────────────────────

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
  const frontmatter = readPromptFrontmatter( prompt, promptDir );
  const promptSkills = frontmatter.skills ? loadPromptSkills( frontmatter.skills, promptDir ) : [];

  return async input => {
    const agentSkills = typeof skills === 'function' ? await skills( input ) : skills;
    const allSkills = [ ...promptSkills, ...agentSkills ];

    const skillTools = allSkills.length > 0 ? { load_skill: buildLoadSkillTool( allSkills ) } : {};
    const allTools = { ...tools, ...skillTools };
    const hasTools = Object.keys( allTools ).length > 0;

    const variables = {
      ...toVariables( input ),
      ...( allSkills.length > 0 ? { _system_skills: buildSystemSkillsVar( allSkills ) } : {} )
    };

    const result = await generateText( {
      prompt,
      promptDir,
      variables,
      ...( hasTools ? { tools: allTools, stopWhen: stepCountIs( maxSteps ) } : {} ),
      ...( outputSchema ? { output: Output.object( { schema: outputSchema } ) } : {} ),
      ...rest
    } );

    return outputSchema ? result.output : result.result;
  };
}
