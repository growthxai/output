import { z } from '@outputai/core';

export const VERDICT = {
  PASS: 'pass',
  PARTIAL: 'partial',
  FAIL: 'fail'
} as const;

export const CRITICALITY = {
  REQUIRED: 'required',
  INFORMATIONAL: 'informational'
} as const;

export const VerdictSchema = z.enum( [ VERDICT.PASS, VERDICT.PARTIAL, VERDICT.FAIL ] );
export type Verdict = z.infer<typeof VerdictSchema>;

export const CriticalitySchema = z.enum( [ CRITICALITY.REQUIRED, CRITICALITY.INFORMATIONAL ] );
export type Criticality = z.infer<typeof CriticalitySchema>;

export type InterpretConfig =
  { type: 'verdict' } |
  { type: 'boolean' } |
  { type: 'number'; pass: number; partial?: number } |
  { type: 'string'; pass: string[]; partial?: string[] };

export const InterpretConfigSchema: z.ZodType<InterpretConfig> = z.discriminatedUnion( 'type', [
  z.object( { type: z.literal( 'verdict' ) } ),
  z.object( { type: z.literal( 'boolean' ) } ),
  z.object( { type: z.literal( 'number' ), pass: z.number(), partial: z.number().optional() } ),
  z.object( { type: z.literal( 'string' ), pass: z.array( z.string() ), partial: z.array( z.string() ).optional() } )
] );

export interface EvaluatorResult {
  name: string;
  verdict: Verdict;
  criticality: Criticality;
  confidence?: number;
  reasoning?: string;
  feedback?: unknown[];
}

export const EvaluatorResultSchema: z.ZodType<EvaluatorResult> = z.object( {
  name: z.string(),
  verdict: VerdictSchema,
  criticality: CriticalitySchema,
  confidence: z.number().optional(),
  reasoning: z.string().optional(),
  feedback: z.array( z.any() ).optional()
} );

export interface EvalCase {
  datasetName: string;
  verdict: Verdict;
  evaluators: EvaluatorResult[];
}

export const EvalCaseSchema: z.ZodType<EvalCase> = z.object( {
  datasetName: z.string(),
  verdict: VerdictSchema,
  evaluators: z.array( EvaluatorResultSchema )
} );

export interface EvalSummary {
  total: number;
  passed: number;
  partial: number;
  failed: number;
  acceptableRate: number;
}

export interface EvalOutput {
  cases: EvalCase[];
  summary: EvalSummary;
}

export const EvalOutputSchema: z.ZodType<EvalOutput> = z.object( {
  cases: z.array( EvalCaseSchema ),
  summary: z.object( {
    total: z.number(),
    passed: z.number(),
    partial: z.number(),
    failed: z.number(),
    acceptableRate: z.number()
  } )
} );

export interface GroundTruth {
  evals?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export interface LastOutput {
  output: unknown;
  executionTimeMs?: number;
  date: string;
}

export interface LastEval {
  output: EvalCase;
  executionTimeMs?: number;
  date: string;
}

export const LastOutputSchema: z.ZodType<LastOutput> = z.object( {
  output: z.any(),
  executionTimeMs: z.number().optional(),
  date: z.string()
} );

export const LastEvalSchema: z.ZodType<LastEval> = z.object( {
  output: EvalCaseSchema,
  executionTimeMs: z.number().optional(),
  date: z.string()
} );

export interface Dataset {
  name: string;
  input: Record<string, unknown>;
  ground_truth?: GroundTruth;
  last_output?: LastOutput;
  last_eval?: LastEval;
  [key: string]: unknown;
}

export const DatasetSchema = z.object( {
  name: z.string(),
  input: z.record( z.string(), z.any() ),
  ground_truth: z.object( {
    evals: z.record( z.string(), z.record( z.string(), z.any() ) ).optional()
  } ).passthrough().optional(),
  last_output: LastOutputSchema.optional(),
  last_eval: LastEvalSchema.optional()
} ).passthrough();
