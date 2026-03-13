import { validateEvaluator } from './validations/static.js';
import { validateWithSchema } from './validations/runtime.js';
import { setMetadata } from '#utils';
import { ValidationError } from '#errors';
import { ComponentType } from '#consts';
import { EvaluationResult } from './evaluation_result.js';
/**
 * Expose the function to create a new evaluator
 * @param {object} opts
 * @param {string} opts.name
 * @param {string} opts.description
 * @param {z.ZodType} opts.inputSchema
 * @param {Function} opts.fn
 * @param {object} opts.options
 * @returns {Function}
 */
export function evaluator( { name, description, inputSchema, fn, options } ) {
  validateEvaluator( { name, description, inputSchema, fn, options } );

  const wrapper = async input => {
    validateWithSchema( inputSchema, input, `Evaluator ${name} input` );

    const output = await fn( input );

    if ( !( output instanceof EvaluationResult ) ) {
      throw new ValidationError( 'Evaluators must return an EvaluationResult' );
    }

    return output;
  };

  setMetadata( wrapper, { name, description, inputSchema, type: ComponentType.EVALUATOR, options } );
  return wrapper;
};
