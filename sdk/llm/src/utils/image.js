import { Logger } from '@outputai/core';

/**
 * Get the approximate file size from a base64 string.
 * @param {string} b64data
 * @returns {number} Size in bytes
 */
export const calculateBase64FileSize = b64data => {
  if ( typeof b64data !== 'string' ) {
    return null;
  }
  const baseSize = b64data.length * ( 3 / 4 );
  const paddingSize = [ b64data.at( -2 ), b64data.at( -1 ) ].filter( v => v === '=' ).length;
  return baseSize - paddingSize;
};

/**
 * Return a serialized version of the images from the AI SDK response.
 * It contains only the file size and the media-type
 *
 * @param {object} response
 * @returns {Array<{size: number, mediaType: string}>}
 */
export const serializeImagesFromResponse = response => {
  try {
    if ( !Array.isArray( response?.images ) ) {
      return [];
    }
    return response.images
      .filter( image => image !== null && typeof image === 'object' )
      .map( ( { base64, mediaType } ) => ( { size: calculateBase64FileSize( base64 ), mediaType } ) );

  } catch ( error ) {
    Logger.error( 'Image serialization failed', { namespace: 'LLM', error: error?.message || String( error ) } );
    return [];
  }
};
