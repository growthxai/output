import { Output } from 'ai';
import { z } from 'zod';
import { EvaluationBooleanResult, EvaluationNumberResult, EvaluationStringResult, EvaluationVerdictResult } from '#interface/evaluation_result';
import { generateText } from './generate.js';

const CONFIDENCE = 0.9;

const verdictSchema = z.object( { verdict: z.enum( [ 'pass', 'partial', 'fail' ] ), reasoning: z.string() } );
const scoreSchema = z.object( { score: z.number(), reasoning: z.string() } );
const booleanSchema = z.object( { result: z.boolean(), reasoning: z.string() } );
const labelSchema = z.object( { label: z.string(), reasoning: z.string() } );

const judge = async ( { prompt, variables, schema } ) => {
  const { output } = await generateText( { prompt, variables, output: Output.object( { schema } ) } );
  return output;
};

/**
 * Ask an LLM judge for a pass, partial, or fail verdict.
 */
export const judgeVerdict = async ( { prompt, variables, schema = verdictSchema } ) => {
  const { verdict, reasoning } = await judge( { prompt, variables, schema } );
  return new EvaluationVerdictResult( { value: verdict, confidence: CONFIDENCE, reasoning } );
};

/**
 * Ask an LLM judge for a numeric score.
 */
export const judgeScore = async ( { prompt, variables, schema = scoreSchema } ) => {
  const { score, reasoning } = await judge( { prompt, variables, schema } );
  return new EvaluationNumberResult( { value: score, confidence: CONFIDENCE, reasoning } );
};

/**
 * Ask an LLM judge for a true or false answer.
 */
export const judgeBoolean = async ( { prompt, variables, schema = booleanSchema } ) => {
  const { result, reasoning } = await judge( { prompt, variables, schema } );
  return new EvaluationBooleanResult( { value: result, confidence: CONFIDENCE, reasoning } );
};

/**
 * Ask an LLM judge for a label.
 */
export const judgeLabel = async ( { prompt, variables, schema = labelSchema } ) => {
  const { label, reasoning } = await judge( { prompt, variables, schema } );
  return new EvaluationStringResult( { value: label, confidence: CONFIDENCE, reasoning } );
};
