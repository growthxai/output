import { EvaluatorValidator } from './validations/index.js';
import { setMetadata } from '#internal_utils/component';
import { ComponentType } from '#consts';

/**
 * Create a new evaluator (activity flavor) and return a wrapper function around its fn handler
 */
export function evaluator( { name, description, inputSchema, fn, options } ) {
  EvaluatorValidator.validateDefinition( { name, description, inputSchema, fn, options } );
  const validator = new EvaluatorValidator( { name, inputSchema } );

  const wrapper = async input => {
    validator.validateInput( input );
    const output = await fn( input );
    validator.validateOutput( output );
    return output;
  };

  setMetadata( wrapper, { name, description, inputSchema, type: ComponentType.EVALUATOR, options } );
  return wrapper;
};
