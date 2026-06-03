import { loadImageModel, loadTextModel, loadTools } from './ai_model.js';

/**
 * Convert a loaded prompt into AI SDK text generation options.
 *
 * @param {object} prompt - Loaded prompt object
 * @returns {object} Options for AI SDK text calls
 */
export const loadAiSdkTextOptions = prompt => {
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
export const loadAiSdkImageOptions = prompt => {
  const options = {
    model: loadImageModel( prompt ),
    prompt: prompt.messages.map( m => m.content ).join( '\n\n' ),
    providerOptions: prompt.config.providerOptions
  };
  for ( const key of [ 'n', 'maxImagesPerCall', 'size', 'aspectRatio', 'seed' ] ) {
    if ( prompt.config[key] !== undefined ) {
      options[key] = prompt.config[key];
    }
  }
  return options;
};
