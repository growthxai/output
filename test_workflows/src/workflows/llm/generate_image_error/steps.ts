import { step, z } from '@outputai/core';
import { generateImage } from '@outputai/llm';

/**
 * Negative control for the metering work: image calls expose no lifecycle events, so a failure
 * happens before any usage exists. The llm trace node should carry the error and no cost at all.
 */
export const generateMissingImageModel = step( {
  name: 'generateMissingImageModel',
  description: 'Fails an image generation before any usage is reported',
  outputSchema: z.object( { mediaType: z.string() } ),
  fn: async () => {
    const result = await generateImage( { prompt: 'missing_image_model@v1' } );

    return { mediaType: result.result.mediaType };
  }
} );
