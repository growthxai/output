import { StepValidator } from './validations/index.js';
import { createStep } from '#helpers/component';

/**
 * Create a new step (activity flavor) and return a wrapper function around its fn handler
 */
export function step( { name, description, inputSchema, outputSchema, fn, options } ) {
  StepValidator.validateDefinition( { name, description, inputSchema, outputSchema, fn, options } );
  const validator = new StepValidator( { name, inputSchema, outputSchema } );

  return createStep( {
    name,
    description,
    inputSchema,
    outputSchema,
    options,
    handler: async input => {
      validator.validateInput( input );
      const output = await fn( input );
      validator.validateOutput( output );
      return output;
    }
  } );
}
