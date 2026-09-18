import { workflow, z } from '@outputai/core';
import { generateMissingImageModel } from './steps.js';

export default workflow( {
  name: 'generate_image_error',
  description: 'generateImage failures have no usage to bill, so the trace must show cost-free error',
  outputSchema: z.object( { mediaType: z.string() } ),
  fn: async () => generateMissingImageModel()
} );
