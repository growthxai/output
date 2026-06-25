import { EvaluatorValidator } from './validations/index.js';
import { createEvaluator } from '#helpers/component';

/**
 * Create a new evaluator (activity flavor) and return a wrapper function around its fn handler
 */
export function evaluator( { name, description, inputSchema, fn, options } ) {
  EvaluatorValidator.validateDefinition( { name, description, inputSchema, fn, options } );
  const validator = new EvaluatorValidator( { name, inputSchema } );

  return createEvaluator( {
    name,
    description,
    inputSchema,
    options,
    handler: async input => {
      validator.validateInput( input );
      const output = await fn( input );
      validator.validateOutput( output );
      return output;
    }
  } );
}
