import { loadImageModel, loadTextModel, loadTools } from './ai_model.js';
import { FatalError } from '@outputai/core';

/**
 * Convert a loaded prompt into AI SDK text generation options.
 *
 * @param {object} prompt - Loaded prompt object
 * @returns {object} Options for AI SDK text calls
 */
export const loadAiSdkTextOptions = prompt => {
  if ( prompt.messages.length === 0 ) {
    throw new FatalError( `Prompt "${prompt.name}" has no chat-style messages. Add role-tagged blocks like <system> or <user>.` );
  }
  const options = {
    model: loadTextModel( prompt ),
    messages: prompt.messages,
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
