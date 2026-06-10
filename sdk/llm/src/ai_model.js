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
  const { tools: promptTools, provider: providerName } = prompt.config;

  if ( Object.keys( promptTools ?? {} ).length === 0 ) {
    return null;
  }

  const provider = getProvider( providerName );

  if ( !provider.tools ) {
    throw new ValidationError( `Provider "${providerName}" does not support provider-specific tools.` );
  }

  const supportedTools = Object.keys( provider.tools );
  const invalidTools = Object.keys( promptTools ).filter( name => !supportedTools.includes( name ) );

  if ( invalidTools.length > 0 ) {
    throw new ValidationError( `Invalid tool(s) ${invalidTools.join( ', ' )} for provider "${providerName}". \
Available: ${supportedTools.join( ', ' )}.` );
  }

  // load all tools and return in an object
  return Object.fromEntries(
    Object.entries( promptTools ).map( ( [ name, args ] ) => [ name, provider.tools[name]( args ) ] )
  );
};
