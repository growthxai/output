import { workflow, z } from '@outputai/core';
import { generateNascarImage } from './steps.js';

export default workflow( {
  name: 'generate_image',
  description: 'Generate a NASCAR race image using the LLM image API',
  inputSchema: z.object( {
    scene: z.string(),
    style: z.string().optional()
  } ),
  outputSchema: z.object( {
    fileName: z.string()
  } ),
  fn: async input => generateNascarImage( input )
} );
