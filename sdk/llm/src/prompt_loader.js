import { parsePrompt } from './parser.js';
import { Liquid } from 'liquidjs';
import { loadContentWithDir } from './load_content.js';
import { validatePrompt } from './prompt_validations.js';
import { FatalError } from '@outputai/core';

// Sentinel characters from the Unicode Private Use Area. We use them to
// neutralize `<` / `>` emitted from `{{ ... }}` interpolations so user-supplied
// values can't be tokenized by parsePrompt as message-block tags. The sentinels
// are reverted to real angle brackets after parsing.
const TAG_OPEN = '\uE000';
const TAG_CLOSE = '\uE001';
const VAR_SAFE_FILTER = '__var_safe';

const liquid = new Liquid();
liquid.registerFilter( VAR_SAFE_FILTER, value =>
  value === null || value === undefined ?
    '' :
    String( value ).replaceAll( '<', TAG_OPEN ).replaceAll( '>', TAG_CLOSE )
);

// Append `| __var_safe` to every `{{ ... }}` expression in the raw template
// so the escape filter runs last in the filter chain. `{% raw %}` regions are
// emitted verbatim by Liquid and must be skipped.
const armVariables = raw => {
  const segments = raw.split( /(\{%\s*raw\s*%\}[\s\S]*?\{%\s*endraw\s*%\})/ );
  return segments.map( ( segment, i ) => {
    if ( i % 2 === 1 ) {
      return segment;
    }
    return segment.replace(
      /\{\{\s*([\s\S]+?)\s*\}\}/g,
      ( _, expr ) => `{{ ${expr.trim()} | ${VAR_SAFE_FILTER} }}`
    );
  } ).join( '' );
};

const unescapeSentinels = text =>
  text.replaceAll( TAG_OPEN, '<' ).replaceAll( TAG_CLOSE, '>' );

const unescapeConfigValues = value => {
  if ( typeof value === 'string' ) {
    return unescapeSentinels( value );
  }
  if ( Array.isArray( value ) ) {
    return value.map( unescapeConfigValues );
  }
  if ( value !== null && typeof value === 'object' ) {
    return Object.fromEntries(
      Object.entries( value ).map( ( [ k, v ] ) => [ k, unescapeConfigValues( v ) ] )
    );
  }
  return value;
};

const renderPrompt = ( name, content, values ) => {
  try {
    return liquid.parseAndRenderSync( armVariables( content ), values );
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
  const found = loadContentWithDir( `${name}.prompt`, dir );
  if ( !found ) {
    throw new FatalError( `Prompt ${name} not found.` );
  }

  const renderedContent = renderPrompt( name, found.content, values );

  const { config, messages } = parsePrompt( renderedContent );

  const prompt = {
    name,
    config: unescapeConfigValues( config ),
    messages: messages.map( m => ( { ...m, content: unescapeSentinels( m.content ) } ) )
  };

  validatePrompt( prompt );

  return { ...prompt, promptFileDir: found.dir };
};
