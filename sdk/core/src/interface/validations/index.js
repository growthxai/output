import { ValidationError } from '#errors';
import { prettifyError } from 'zod';
import {
  evaluatorOutputSchema,
  evaluatorSchema,
  httpRequestSchema,
  executeInParallelSchema,
  stepSchema,
  workflowInvocationOptionsSchema,
  workflowSchema,
  logArgumentsSchema
} from './schemas.js';

/**
 * Validates data using a Zod schema
 * @param {unknown} data
 * @param {ZodType} schema
 * @param {string} prefix - Validation error prefix
 * @throws {ValidationError} If validation fails
 * @returns {void}
 */
const validate = ( data, schema, prefix = '' ) => {
  if ( !schema ) {
    return;
  }

  const result = schema.safeParse( data );
  if ( !result.success ) {
    throw new ValidationError( `${prefix} validation failed: ${prettifyError( result.error ) }` );
  }
};

export class WorkflowValidator {
  static validateDefinition( definition ) {
    validate( definition, workflowSchema, 'Workflow' );
  }

  constructor( { name, inputSchema, outputSchema } ) {
    this.name = name;
    this.inputSchema = inputSchema;
    this.outputSchema = outputSchema;
  }

  validateInput( input ) {
    validate( input, this.inputSchema, `Workflow "${this.name}" input` );
  }

  validateOutput( output ) {
    validate( output, this.outputSchema, `Workflow "${this.name}" output` );
  }

  validateInvocationOptions( options ) {
    validate( options, workflowInvocationOptionsSchema, `Workflow "${this.name}" invocation options` );
  }
}

export class StepValidator {
  static validateDefinition( definition ) {
    validate( definition, stepSchema, 'Step' );
  }

  constructor( { name, inputSchema, outputSchema } ) {
    this.name = name;
    this.inputSchema = inputSchema;
    this.outputSchema = outputSchema;
  }

  validateInput( input ) {
    validate( input, this.inputSchema, `Step "${this.name}" input` );
  }

  validateOutput( output ) {
    validate( output, this.outputSchema, `Step "${this.name}" output` );
  }
}

export class EvaluatorValidator {
  static validateDefinition( definition ) {
    validate( definition, evaluatorSchema, 'Evaluator' );
  }
  constructor( { name, inputSchema } ) {
    this.name = name;
    this.inputSchema = inputSchema;
  }

  validateInput( input ) {
    validate( input, this.inputSchema, `Evaluator "${this.name}" input` );
  }

  validateOutput( output ) {
    validate( output, evaluatorOutputSchema, `Evaluator "${this.name}" output` );
  }
}

/**
 * Validate request payload
 * @param {object} args - The request arguments
 */
export function validateRequestPayload( args ) {
  validate( args, httpRequestSchema, 'Request payload' );
};

/**
 * Validate executeInParallel
 * @param {object} args - The request arguments
 */
export function validateExecuteInParallel( args ) {
  validate( args, executeInParallelSchema, 'ExecuteInParallel' );
};

export function validateLogArguments( args ) {
  validate( args, logArgumentsSchema, 'Log Arguments' );
};
