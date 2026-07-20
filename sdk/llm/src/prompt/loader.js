import { parsePrompt } from './parser.js';
import { Liquid } from 'liquidjs';
import { loadContent } from './load_content.js';
import { validatePrompt } from './validations.js';
import { FatalError } from '@outputai/core';
import { escape, decode, setupLiquidEncodeFilter } from './escape.js';

const liquid = new Liquid( {
  strictFilters: true,
  strictVariables: true,
  lenientIf: true
} );
setupLiquidEncodeFilter( liquid );

/** Uses LiquidJS to interpolate variables in the prompt file content. */
const renderPrompt = ( { name, escapedContent, values } ) => {
  try {
    return liquid.parseAndRenderSync( escapedContent, values );
  } catch ( error ) {
    throw new FatalError( `Prompt "${name}" could not be rendered: ${error.message}`, { cause: error } );
  }
};

/**
 * Load a prompt file and render it with variables.
 *
 * @param {string} name - Name of the prompt file (without .prompt extension)
 * @param {Record<string, string | number | boolean>} [values] - Variables to interpolate
 * @param {string} [dir] - Directory to search for the prompt file (defaults to stack-resolved invocation dir)
 * @returns {Prompt} Loaded and rendered prompt object, including promptFileDir
 */
export const loadPrompt = ( name, values = {}, dir ) => {
  const file = loadContent( `${name}.prompt`, dir );
  if ( !file ) {
    throw new FatalError( `Prompt "${name}" not found.` );
  }

  const escapedContent = escape( file.content );
  const renderedContent = renderPrompt( { name, escapedContent, values } );

  const { config, messages, instructions } = parsePrompt( { name, raw: renderedContent } );

  const prompt = {
    name,
    config: decode( config ),
    messages: messages.map( m => ( { ...m, content: decode( m.content ) } ) ),
    instructions: instructions === null ? null : decode( instructions )
  };

  validatePrompt( prompt );

  return { ...prompt, promptFileDir: file.dir };
};
