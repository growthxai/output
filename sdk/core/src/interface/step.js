import { StepValidator } from './validations/index.js';
import { assignImmutableProperty } from '#helpers/object';
import { ComponentType, METADATA_ACCESS_SYMBOL } from '#consts';

/**
 * Create a new step (activity flavor) and return a wrapper function around its fn handler
 */
export function step( { name, description, inputSchema, outputSchema, fn, options } ) {
  StepValidator.validateDefinition( { name, description, inputSchema, outputSchema, fn, options } );
  const validator = new StepValidator( { name, inputSchema, outputSchema } );

  const wrapper = async input => {
    validator.validateInput( input );
    const output = await fn( input );
    validator.validateOutput( output );
    return output;
  };

  assignImmutableProperty( wrapper, METADATA_ACCESS_SYMBOL, { name, description, inputSchema, outputSchema, type: ComponentType.STEP, options } );
  return wrapper;
};
