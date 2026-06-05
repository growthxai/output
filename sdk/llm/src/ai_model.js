import { ValidationError } from '@outputai/core';
import { getProvider } from './ai_provider.js';

/**
 * Load a text model from a loaded prompt config.
 *
 * @param {object} prompt - Loaded prompt object with `config.provider` and `config.model`
 * @returns {unknown} AI SDK language model
 */
export const loadTextModel = prompt => getProvider( prompt.config.provider )( prompt.config.model );

/**
 * Load an image model from a loaded prompt config.
 *
 * @param {object} prompt - Loaded prompt object with `config.provider` and `config.model`
 * @returns {unknown} AI SDK image model
 */
export const loadImageModel = prompt => {
  const { provider: providerName, model } = prompt.config;
  const provider = getProvider( prompt.config.provider );

  const imageModelFactory = provider.image ?? provider.imageModel;
  if ( typeof imageModelFactory !== 'function' ) {
    throw new ValidationError( `Provider "${providerName}" does not support image models.` );
  }
  return imageModelFactory( model );
};

/**
 * Load provider-specific tools configured in a prompt.
 *
 * @param {object} prompt - Loaded prompt object with `config.provider` and optional `config.tools`
 * @returns {Record<string, unknown> | null} AI SDK tools, or null when none are configured
 */
export const loadTools = prompt => {
  const { tools: toolsConfig, provider: providerName } = prompt.config;

  if ( !toolsConfig || Object.keys( toolsConfig ).length === 0 ) {
    return null;
  }

  const provider = getProvider( providerName );

  if ( !provider.tools || typeof provider.tools !== 'object' ) {
    throw new ValidationError( `Provider "${providerName}" does not support provider-specific tools.` );
  }

  const list = Object.entries( provider.tools ).filter( ( [ _, v ] ) => typeof v === 'function' ).map( e => e[0] );
  const invalid = Object.keys( toolsConfig ).filter( name => !list.includes( name ) );

  if ( invalid.length > 0 ) {
    throw new ValidationError( `Unsupported tool(s) ${invalid.join( ', ' )} for provider "${providerName}". Available: ${list.join( ', ' )}` );
  }

  // load all tools and return in an object
  return Object.entries( toolsConfig ).reduce( ( loaded, [ name, config ] ) =>
    Object.assign( loaded, { [name]: provider.tools[name]( config ) } )
  , {} );
};
