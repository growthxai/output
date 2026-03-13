// THIS RUNS IN THE TEMPORAL'S SANDBOX ENVIRONMENT
import { setMetadata } from '#utils';
import { validateStep } from './validations/static.js';
import { validateWithSchema } from './validations/runtime.js';
import { ComponentType } from '#consts';

export function step( { name, description, inputSchema, outputSchema, fn, options } ) {
  validateStep( { name, description, inputSchema, outputSchema, fn, options } );

  const wrapper = async input => {
    validateWithSchema( inputSchema, input, `Step ${name} input` );

    const output = await fn( input );

    validateWithSchema( outputSchema, output, `Step ${name} output` );

    return output;
  };

  setMetadata( wrapper, { name, description, inputSchema, outputSchema, type: ComponentType.STEP, options } );
  return wrapper;
};
