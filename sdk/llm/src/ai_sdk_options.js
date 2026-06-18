import { loadImageModel, loadTextModel, loadTools } from './ai_model.js';
import { resolveMessageProviderOptions } from './prompt/block_options.js';
import { ROLE, isRole } from './utils/message.js';
import { FatalError } from '@outputai/core';

/**
 * Convert a loaded prompt into AI SDK text generation options.
 *
 * System blocks are routed to the `system` option (as `SystemModelMessage[]`, so
 * per-message providerOptions like `cacheControl` are preserved) rather than left
 * in `messages` — the AI SDK flags system roles inside `messages` as a prompt
 * injection risk, and `system` is the provider-recommended slot.
 *
 * @param {object} prompt - Loaded prompt object
 * @returns {object} Options for AI SDK text calls
 */
export const loadAiSdkTextOptions = prompt => {
  if ( prompt.messages.length === 0 ) {
    throw new FatalError( `Prompt "${prompt.name}" has no chat-style messages. Add role-tagged blocks like <system> or <user>.` );
  }
  const isSystem = isRole( ROLE.SYSTEM );
  const resolvedMessages = resolveMessageProviderOptions( prompt );
  const system = resolvedMessages.filter( isSystem );

  const options = {
    model: loadTextModel( prompt ),
    ...( system.length > 0 ? { system } : {} ),
    messages: resolvedMessages.filter( message => !isSystem( message ) ),
    providerOptions: prompt.config.providerOptions
  };

  if ( Number.isFinite( prompt.config.temperature ) ) {
    options.temperature = prompt.config.temperature;
  }

  if ( prompt.config.maxTokens ) {
    options.maxOutputTokens = prompt.config.maxTokens;
  }

  const tools = loadTools( prompt );
  if ( tools ) {
    options.tools = tools;
  }

  return options;
};

/**
 * Convert a loaded prompt into AI SDK image generation options.
 *
 * @param {object} prompt - Loaded prompt object
 * @returns {object} Options for AI SDK image calls
 */
export const loadAiSdkImageOptions = ( { prompt, images, mask } ) => {
  if ( !prompt.instructions ) {
    throw new FatalError( `Prompt "${prompt.name}" has no instructions. Image prompts must use plain instructions.` );
  }
  const options = {
    model: loadImageModel( prompt ),
    prompt: ( images || mask ) ? {
      text: prompt.instructions,
      ...( images && { images } ),
      ...( mask && { mask } )
    } : prompt.instructions,
    providerOptions: prompt.config.providerOptions
  };
  for ( const key of [ 'n', 'maxImagesPerCall', 'size', 'aspectRatio', 'seed' ] ) {
    if ( prompt.config[key] !== undefined ) {
      options[key] = prompt.config[key];
    }
  }
  return options;
};
