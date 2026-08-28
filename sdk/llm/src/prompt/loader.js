import { Context, Liquid } from 'liquidjs';
import { parsePromptSchema } from './validations.js';
import { FatalError } from '@outputai/core';
import { pipeInterpolations, interpolationFilterToken, encode, decode } from './interpolations.js';
import { Path } from '@outputai/core/sdk/helpers';
import { searchAndReadFile } from '../utils/file.js';
import matter from 'gray-matter';
import { parseContent } from './content.js';

const liquid = new Liquid( {
  strictFilters: true,
  strictVariables: true,
  lenientIf: true
} );

liquid.registerFilter( interpolationFilterToken, encode );

const splitPromptContent = text => {
  const dummyEngine = () => ( {} ); // dummy engine to allow for split only
  const file = matter( text, { engines: { yaml: dummyEngine } } );
  return { rawFrontmatter: file.matter, rawContent: file.content };
};

const renderContent = ( rawContent, context ) => liquid.parseAndRenderSync( pipeInterpolations( rawContent ), context ).trim();

const renderFrontmatter = ( rawFrontmatter, context ) => liquid.parseAndRenderSync( pipeInterpolations( rawFrontmatter ), context );

const parseFrontmatter = yml => decode( matter( `---\n${yml}\n---\n` ).data );

/**
 * Load a prompt file and render it with variables.
 *
 * @param {string} name - Name of the prompt file (without .prompt extension)
 * @param {Record<string, unknown>} [variables] - Variables to interpolate
 * @param {string} [dir] - Directory to search for the prompt file (defaults to stack-resolved invocation dir)
 * @returns {Prompt} Loaded and rendered prompt object.
 */
export const loadPrompt = ( name, variables = {}, dir = Path.resolveInvocationDir() ) => {
  // Small closure to encapsulate errors with "name"
  const tryStep = ( fn, msg ) => {
    try {
      return fn();
    } catch ( e ) {
      throw new FatalError( [ `${msg} on prompt "${name}"`, e.message ].join( ': ' ), { cause: e } );
    }
  };

  const file = searchAndReadFile( dir, `${name}.prompt` );
  if ( !file ) {
    throw new FatalError( `Prompt file "${name}" not found.` );
  }

  const { rawFrontmatter, rawContent } = tryStep( () => splitPromptContent( file.content ), 'Error parsing frontmatter' );
  const context = new Context( variables, liquid.options, { sync: true } );
  const renderedFrontmatter = tryStep( () => renderFrontmatter( rawFrontmatter, context ), 'Error rendering frontmatter' );
  const content = tryStep( () => renderContent( rawContent, context ), 'Error rendering content' );

  if ( !content ) {
    throw new FatalError( `Prompt "${name}" has no content.` );
  }

  const config = tryStep( () => parseFrontmatter( renderedFrontmatter ), 'Error converting frontmatter yaml to js' );

  const { messages, instructions } = tryStep( () => parseContent( content, config.messageOptions ), 'Error parsing content' );

  return parsePromptSchema( { name, config, messages, instructions, fileDir: file.dir, variables } );
};
