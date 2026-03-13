import {
  EvaluationVerdictResult,
  EvaluationNumberResult,
  EvaluationBooleanResult,
  EvaluationStringResult,
  z
} from '@outputai/core';
import { resolveInvocationDir } from '@outputai/core/sdk_utils';
import { generateText, Output } from '@outputai/llm';

export type JudgeArgs = {
  prompt: string;
  variables?: Record<string, string | number | boolean>;
  schema?: z.ZodType;
};

const verdictSchema = z.object( { verdict: z.enum( [ 'pass', 'partial', 'fail' ] ), reasoning: z.string() } );
const scoreSchema = z.object( { score: z.number(), reasoning: z.string() } );
const booleanSchema = z.object( { result: z.boolean(), reasoning: z.string() } );
const labelSchema = z.object( { label: z.string(), reasoning: z.string() } );

export async function judgeVerdict( { prompt, variables, schema = verdictSchema }: JudgeArgs ): Promise<EvaluationVerdictResult> {
  const promptDir = resolveInvocationDir();
  const response = await generateText( { prompt, variables, promptDir, output: Output.object( { schema } ) } );
  const result = response.output as { verdict: 'pass' | 'partial' | 'fail'; reasoning: string };
  return new EvaluationVerdictResult( { value: result.verdict, confidence: 0.9, reasoning: result.reasoning } );
}

export async function judgeScore( { prompt, variables, schema = scoreSchema }: JudgeArgs ): Promise<EvaluationNumberResult> {
  const promptDir = resolveInvocationDir();
  const response = await generateText( { prompt, variables, promptDir, output: Output.object( { schema } ) } );
  const result = response.output as { score: number; reasoning: string };
  return new EvaluationNumberResult( { value: result.score, confidence: 0.9, reasoning: result.reasoning } );
}

export async function judgeBoolean( { prompt, variables, schema = booleanSchema }: JudgeArgs ): Promise<EvaluationBooleanResult> {
  const promptDir = resolveInvocationDir();
  const response = await generateText( { prompt, variables, promptDir, output: Output.object( { schema } ) } );
  const result = response.output as { result: boolean; reasoning: string };
  return new EvaluationBooleanResult( { value: result.result, confidence: 0.9, reasoning: result.reasoning } );
}

export async function judgeLabel( { prompt, variables, schema = labelSchema }: JudgeArgs ): Promise<EvaluationStringResult> {
  const promptDir = resolveInvocationDir();
  const response = await generateText( { prompt, variables, promptDir, output: Output.object( { schema } ) } );
  const result = response.output as { label: string; reasoning: string };
  return new EvaluationStringResult( { value: result.label, confidence: 0.9, reasoning: result.reasoning } );
}
