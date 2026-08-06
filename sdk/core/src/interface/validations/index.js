import { ValidationError } from '#errors';
import { ComponentType } from '#consts';
import { prettifyError } from 'zod';
import {
  evaluatorOutputSchema,
  evaluatorSchema,
  httpRequestSchema,
  executeInParallelSchema,
  stepSchema,
  workflowInvocationOptionsSchema,
  workflowSchema
} from './schemas.js';

const capitalize = word => word.at( 0 ).toUpperCase() + word.slice( 1 );

const validate = ( schema, data, prefix ) => {
  if ( !schema ) {
    return data;
  }
  const result = schema.safeParse( data );
  if ( result.success === false ) {
    throw new ValidationError( `${prefix} validation failed: ${prettifyError( result.error ) }` );
  }
  return result.data;
};

export class Validator {
  static label;
  static definitionSchema;

  static validateDefinition( definition ) {
    validate( this.definitionSchema, definition, this.label );
  }

  constructor( { name, inputSchema, outputSchema } ) {
    this.name = name;
    this.inputSchema = inputSchema;
    this.outputSchema = outputSchema;
    this.prefix = `${this.constructor.label} "${this.name}"`;
  }

  validateInput( input ) {
    return validate( this.inputSchema, input, `${this.prefix} input` );
  }

  validateOutput( output ) {
    return validate( this.outputSchema, output, `${this.prefix} output` );
  }
}

export class WorkflowValidator extends Validator {
  static label = capitalize( ComponentType.WORKFLOW );
  static definitionSchema = workflowSchema;

  validateInvocationOptions( options ) {
    return validate( workflowInvocationOptionsSchema, options, `${this.prefix} invocation options` );
  }
}

export class StepValidator extends Validator {
  static label = capitalize( ComponentType.STEP );
  static definitionSchema = stepSchema;
}

export class EvaluatorValidator extends Validator {
  static label = capitalize( ComponentType.EVALUATOR );
  static definitionSchema = evaluatorSchema;

  constructor( { name, inputSchema } ) {
    super( { name, inputSchema, outputSchema: evaluatorOutputSchema } );
  }
}

/**
 * Validate request payload
 * @param {object} args - The request arguments
 */
export function validateRequestPayload( args ) {
  validate( httpRequestSchema, args, 'Request payload' );
};

/**
 * Validate executeInParallel
 * @param {object} args - The request arguments
 */
export function validateExecuteInParallel( args ) {
  validate( executeInParallelSchema, args, 'ExecuteInParallel' );
};
