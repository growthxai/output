import { parsePrompt } from './parser.js';
import { Liquid } from 'liquidjs';
import { encodeXML, decodeXML } from 'entities';
import { loadContent } from './load_content.js';
import { validatePrompt } from './validations.js';
import { FatalError } from '@outputai/core';

const VAR_SAFE_FILTER = '__var_safe';

export const escapeXML = value =>
  value === null || value === undefined ? '' : encodeXML( String( value ) );

const liquid = new Liquid();
liquid.registerFilter( VAR_SAFE_FILTER, escapeXML );

// Append `| __var_safe` to every `{{ ... }}` expression so variable output is
// XML-escaped before parsePrompt tokenizes message blocks. Without this, a
// variable whose value contains `<system>` or `</user>` would inject extra
// message blocks. `{% raw %}` regions are emitted verbatim by Liquid and are
// preserved unchanged via the first alternative in the regex below — JS regex
// with `g` consumes the matched span and advances past it, so any `{{ ... }}`
// inside a raw block is never reached as a separate match.
const VAR_OR_RAW = /(\{%\s*raw\s*%\}[\s\S]*?\{%\s*endraw\s*%\})|\{\{\s*([\s\S]+?)\s*\}\}/g;

export const escapeVariableContent = raw =>
  raw.replace( VAR_OR_RAW, ( _match, rawBlock, expr ) =>
    rawBlock === undefined ? `{{ ${expr.trim()} | ${VAR_SAFE_FILTER} }}` : rawBlock
  );

const decodeConfigValues = value => {
  if ( typeof value === 'string' ) {
    return decodeXML( value );
  }
  if ( Array.isArray( value ) ) {
    return value.map( decodeConfigValues );
  }
  if ( value !== null && typeof value === 'object' ) {
    return Object.fromEntries(
      Object.entries( value ).map( ( [ k, v ] ) => [ k, decodeConfigValues( v ) ] )
    );
  }
  return value;
};

const renderPrompt = ( name, content, values ) => {
  try {
    return liquid.parseAndRenderSync( escapeVariableContent( content ), values );
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
 * @returns {Prompt} Loaded and rendered prompt object, including promptFileDir
 */
export const loadPrompt = ( name, values = {}, dir ) => {
  const found = loadContent( `${name}.prompt`, dir );
  if ( !found ) {
    throw new FatalError( `Prompt ${name} not found.` );
  }

  const renderedContent = renderPrompt( name, found.content, values );

  const { config, messages } = parsePrompt( renderedContent );

  const prompt = {
    name,
    config: decodeConfigValues( config ),
    messages: messages.map( m => ( { ...m, content: decodeXML( m.content ) } ) )
  };

  validatePrompt( prompt );

  return { ...prompt, promptFileDir: found.dir };
};
