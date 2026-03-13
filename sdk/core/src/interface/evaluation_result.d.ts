import type { z } from 'zod';

/**
 * A single feedback for an EvaluationResult
 */
export class EvaluationFeedback {
  /**
   * Issue found
   */
  issue: string;

  /**
   * Improvement suggestion
   */
  suggestion?: string;

  /**
   * Reference for the issue
   */
  reference?: string;

  /**
   * Issue priority
   */
  priority?: 'low' | 'medium' | 'high' | 'critical';

  /**
   * @constructor
   * @param args
   * @param args.issue
   * @param args.suggestion
   * @param args.reference
   * @param args.priority
   */
  constructor( args: {
    issue: string;
    suggestion?: string;
    reference?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
  } );

  /**
   * @returns The zod schema for this class
   */
  static get schema(): z.ZodType;
}

/**
 * Base constructor arguments for EvaluationResult classes
 */
export type EvaluationResultArgs<TValue = any> = { // eslint-disable-line @typescript-eslint/no-explicit-any
  /**
   * The value of the evaluation
   */
  value: TValue;
  /**
   * The confidence in the evaluation
   */
  confidence: number;
  /**
   * The name of the evaluation
   */
  name?: string;
  /**
   * The reasoning behind the result
   */
  reasoning?: string;
  /**
   * Feedback for this evaluation
   */
  feedback?: EvaluationFeedback[];
  /**
   * Dimensions of this evaluation
   */
  dimensions?: Array<EvaluationStringResult | EvaluationNumberResult | EvaluationBooleanResult>;
};

/**
 * Represents the result of an evaluation.
 *
 * Generic base class; evaluators must return an instance of an EvaluationResult subclass.
 */
export class EvaluationResult {
  /**
   * The name of the evaluation result
   */
  name?: string;

  /**
   * The evaluation result value
   */
  value: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  /**
   * The evaluation result confidence
   */
  confidence: number;

  /**
   * The evaluation result reasoning
   */
  reasoning?: string;

  /**
   * Feedback for this evaluation
   */
  feedback: EvaluationFeedback[];

  /**
   * Dimensions of this evaluation
   */
  dimensions: Array<EvaluationStringResult | EvaluationNumberResult | EvaluationBooleanResult>;

  /**
   * @constructor
   * @param args
   */
  constructor( args: EvaluationResultArgs );

  /**
   * @returns The zod schema for this class
   */
  static get schema(): z.ZodType;
}

/**
 * An evaluation result where the value is a string
 * @extends EvaluationResult
 */
export class EvaluationStringResult extends EvaluationResult {
  /**
   * @constructor
   * @param args
   */
  constructor( args: EvaluationResultArgs<string> );
}

/**
 * An evaluation result where the value is a number
 * @extends EvaluationResult
 */
export class EvaluationNumberResult extends EvaluationResult {
  /**
   * @constructor
   * @param args
   */
  constructor( args: EvaluationResultArgs<number> );
}

/**
 * An evaluation result where the value is a boolean
 * @extends EvaluationResult
 */
export class EvaluationBooleanResult extends EvaluationResult {
  /**
   * @constructor
   * @param args
   */
  constructor( args: EvaluationResultArgs<boolean> );
}

/**
 * An evaluation result where the value is a verdict (pass, partial, fail)
 * @extends EvaluationResult
 */
export class EvaluationVerdictResult extends EvaluationResult {
  /**
   * @constructor
   * @param args - See {@link EvaluationResultArgs} for full parameter documentation.
   * @param args.value - The verdict: 'pass', 'partial', or 'fail'.
   */
  constructor( args: EvaluationResultArgs<'pass' | 'partial' | 'fail'> );
}
