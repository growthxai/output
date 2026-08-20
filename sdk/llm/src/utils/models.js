import { ValidationError } from '@outputai/core';
import { getProvider } from '../ai_provider.js';

/** Load a model from a prompt */
export const loadTextModel = prompt => getProvider( prompt.config.provider )( prompt.config.model );

/** Load an image model from a prompt. */
export const loadImageModel = prompt => {
  const provider = getProvider( prompt.config.provider );
  const imageModelFactory = provider.image ?? provider.imageModel;
  if ( typeof imageModelFactory !== 'function' ) {
    throw new ValidationError( `Provider "${prompt.config.provider}" used by prompt "${prompt.name}" does not support image models.` );
  }
  return imageModelFactory( prompt.config.model );
};
