import { workflow, z } from '@outputai/core';
import { generateStreamedInvalidSchemaOutput } from './steps.js';

const outputSchema = z.object( {
  answer: z.string()
} );

export default workflow( {
  name: 'streaming_invalid_schema',
  description: 'generateTextWithStreaming must bill usage and cost when the output fails to validate',
  outputSchema,
  fn: async () => generateStreamedInvalidSchemaOutput()
} );
