import { workflow, z } from '@outputai/core';
import { generateInvalidSchemaOutput } from './steps.js';

const outputSchema = z.object( {
  answer: z.string()
} );

export default workflow( {
  name: 'invalid_schema',
  description: 'A workflow that intentionally triggers AI SDK output schema validation failure',
  outputSchema,
  fn: async () => generateInvalidSchemaOutput()
} );
