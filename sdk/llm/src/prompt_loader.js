import { parsePrompt } from './parser.js';
import { Liquid } from 'liquidjs';
import { loadContent } from './load_content.js';
import { validatePrompt } from './prompt_validations.js';
import { FatalError } from '@outputai/core';

const liquid = new Liquid();

const renderPrompt = ( name, content, values ) => {
  try {
    return liquid.parseAndRenderSync( content, values );
  } catch ( error ) {
    throw new FatalError( `Failed to render template in prompt "${name}": ${error.message}`, { cause: error } );
  }
};

/**
 * Load a prompt file and render it with variables.
 *
 * @param {string} name - Name of the prompt file (without .prompt extension)
 * @param {Record<string, string | number | boolean>} [values] - Variables to interpolate
 * @param {string} [dir] - Directory to search for the prompt file (defaults to stack-resolved invocation dir)
 * @returns {Prompt} Loaded and rendered prompt object
 */
export const loadPrompt = ( name, values = {}, dir ) => {
  const promptContent = dir ? loadContent( `${name}.prompt`, dir ) : loadContent( `${name}.prompt` );
  if ( !promptContent ) {
    throw new FatalError( `Prompt ${name} not found.` );
  }

  const renderedContent = renderPrompt( name, promptContent, values );

  const { config, messages } = parsePrompt( renderedContent );

  const prompt = {
    name,
    config,
    messages
  };

  validatePrompt( prompt );

  return prompt;
};

