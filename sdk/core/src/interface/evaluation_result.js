import { ValidationError } from '#errors';
import * as z from 'zod';

/**
 * Error for when EvaluationResult are invalid
 */
export class EvaluationResultValidationError extends ValidationError {};

/**
 * A single feedback for an EvaluationResult
 */
export class EvaluationFeedback {

  /**
   * Issue found
   * @type {string}
   */
  issue;

  /**
   * Improvement suggestion
   * @type {string}
   */
  suggestion;

  /**
   * Reference for the issue
   * @type {string}
   */
  reference;

  /**
   * Issue priority
   * @type {'low' | 'medium' | 'high' | 'critical' | undefined}
   */
  priority;

  /**
   * The zod schema for this class
   * @type {z.ZodType}
   */
  static get schema() {
    return z.object( {
      issue: z.string(),
      suggestion: z.string().optional(),
      reference: z.string().optional(),
      priority: z.enum( [ 'low', 'medium', 'high', 'critical' ] ).optional()
    } );
  };

  /**
   * @constructor
   * @param {object} args
   * @param {string} args.issue
   * @param {string} [args.suggestion]
   * @param {string} [args.reference]
   * @param {'low' | 'medium' | 'high' | 'critical'} [args.priority]
   */
  constructor( { issue, suggestion = undefined, reference = undefined, priority = undefined } ) {
    const result = this.constructor.schema.safeParse( { issue, suggestion, reference, priority } );
    if ( result.error ) {
      throw new EvaluationResultValidationError( z.prettifyError( result.error ) );
    }
    this.issue = issue;
    this.suggestion = suggestion;
    this.reference = reference;
    this.priority = priority;
  }
}

/**
 * Generic EvaluationResult class, represents the result of an evaluation.
 */
export class EvaluationResult {

  /**
   * The name of the evaluation result
   * @type {string}
   */
  name;

  /**
   * The evaluation result value
   * @type {any}
   */
  value = null;

  /**
   * The confidence value, between 0 and 1
   * @type {number}
   */
  confidence;

  /**
   * The reasoning value
   * @type {string}
   */
  reasoning;

  /**
   * Feedback for this evaluation
   * @type {EvaluationFeedback[]}
   */
  feedback = [];

  /**
   * Dimensions of this evaluation
   * @type {EvaluationResult[]}
   */
  dimensions = [];

  /**
   * The schema main field
   * @type {z.ZodAny}
   */
  static valueSchema = z.any();

  /**
   * The zod schema for this class
   * @type {z.ZodType}
   */
  static get schema() {
    const baseSchema = z.object( {
      value: this.valueSchema,
      confidence: z.number(),
      reasoning: z.string().optional(),
      name: z.string().optional(),
      feedback: z.array( EvaluationFeedback.schema ).optional()
    } );

    // Adds dimension but keep it only one level deep
    return baseSchema.extend( {
      dimensions: z.array(
        baseSchema.extend( {
          value: z.union( [ z.string(), z.number(), z.boolean() ] )
        } )
      ).optional()
    } );
  };

  /**
   * @constructor
   * @param {object} args
   * @param {any} args.value
   * @param {number} args.confidence
   * @param {string} [args.name]
   * @param {EvaluationResult[]} [args.dimensions]
   * @param {EvaluationFeedback[]} [args.feedback]
   * @param {string} [args.reasoning]
   */
  constructor( { value, confidence, dimensions = [], feedback = [], name = undefined, reasoning = undefined } ) {
    const result = this.constructor.schema.safeParse( { value, confidence, dimensions, feedback, name, reasoning } );
    if ( result.error ) {
      throw new EvaluationResultValidationError( z.prettifyError( result.error ) );
    }
    this.confidence = confidence;
    this.value = value;
    this.dimensions = dimensions;
    this.feedback = feedback;
    this.name = name;
    this.reasoning = reasoning;
  }
};

/**
 * An evaluation result that uses a string value
 * @extends EvaluationResult
 * @property {string} value - The evaluation result value
 * @constructor
 * @param {object} args
 * @param {string} args.value - The value of the evaluation (must be a string)
 * @see EvaluationResult#constructor for other parameters (confidence, reasoning)
 */
export class EvaluationStringResult extends EvaluationResult {
  static valueSchema = z.string();
};

/**
 * An evaluation result that uses a boolean value
 * @extends EvaluationResult
 * @property {boolean} value - The evaluation result value
 * @constructor
 * @param {object} args
 * @param {boolean} args.value - The value of the evaluation (must be a boolean)
 * @see EvaluationResult#constructor for other parameters (confidence, reasoning)
 */
export class EvaluationBooleanResult extends EvaluationResult {
  static valueSchema = z.boolean();
};

/**
 * An evaluation result that uses a number value
 * @extends EvaluationResult
 * @property {number} value - The evaluation result value
 * @constructor
 * @param {object} args
 * @param {number} args.value - The value of the evaluation (must be a number)
 * @see EvaluationResult#constructor for other parameters (confidence, reasoning)
 */
export class EvaluationNumberResult extends EvaluationResult {
  static valueSchema = z.number();
};

/**
 * An evaluation result that uses a verdict value (pass, partial, fail)
 * @extends EvaluationResult
 * @property {'pass' | 'partial' | 'fail'} value - The evaluation verdict
 * @constructor
 * @param {object} args
 * @param {'pass' | 'partial' | 'fail'} args.value - The verdict value
 * @see EvaluationResult#constructor for other parameters (confidence, reasoning)
 */
export class EvaluationVerdictResult extends EvaluationResult {
  static valueSchema = z.enum( [ 'pass', 'partial', 'fail' ] );
};
