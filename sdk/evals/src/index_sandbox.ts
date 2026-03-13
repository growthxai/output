/*
 * HACK: Export workflow-safe function signatures independently.
 *
 * Problem:
 * Eval workflow files pass evaluator functions as config values to evalWorkflow():
 *
 *   export default evalWorkflow({ evals: [{ evaluator: evaluateTopic, ... }] });
 *
 * The webpack rewriter (workflow_rewriter/index.mjs) is supposed to strip evaluator
 * imports from the AST via collectTargetImports(), which calls path.remove() on each
 * matched import declaration. However, after collecting imports, the rewriter checks
 * if rewriteFnBodies() performed any rewrites. For eval workflows — which have no
 * fn body, only a config object — rewriteFnBodies() returns false. When that happens,
 * the rewriter returns the original source string unchanged (lines 46-48), discarding
 * the import stripping that collectTargetImports() already applied to the AST.
 *
 * This means webpack follows the full import chain: evaluators.js → @outputai/evals
 * → judge.js → @outputai/llm → node:zlib — which fails because Node.js built-ins
 * can't be bundled into Temporal's deterministic workflow bundle.
 *
 * This file provides an alternative entry point for @outputai/evals that excludes
 * the real judge functions (breaking the chain to @outputai/llm) and replaces them
 * with no-op stubs. The stubs satisfy webpack's named-export resolution. Judge
 * functions are never called inside the workflow bundle — they execute as Temporal
 * activities at runtime where the real entry point (index.js) is used.
 *
 * Remove when:
 * The workflow rewriter in sdk/core/src/worker/webpack_loaders/workflow_rewriter/index.mjs
 * is fixed to generate output from the modified AST even when rewriteFnBodies() returns
 * false — i.e. when collectTargetImports() stripped imports but no fn bodies needed
 * rewriting. This also requires injecting metadata stubs for the stripped evaluator
 * references, since evalWorkflow() calls getMetadata(def.evaluator) at module init time
 * and the identifiers would otherwise be undefined. Once the rewriter properly strips the
 * evaluator → judge → @outputai/llm chain, this file and the "output-workflow-bundle" export
 * condition in package.json can be deleted.
 */

export { evalWorkflow } from './eval_workflow.js';
export type { EvalDefinition, EvalWorkflowConfig, EvalWorkflowInput, EvalWorkflowFn, EvalWorkflowOptions } from './eval_workflow.js';
export { Verdict } from './verdict.js';
export { verify } from './verify.js';
export type { CheckContext } from './verify.js';
export type { JudgeArgs } from './judge.js';
export { interpretResult } from './interpret.js';
export { aggregateCaseVerdict } from './aggregate.js';
export { renderEvalOutput, computeExitCode } from './render.js';
export { getEvalWorkflowName, isEvalWorkflow, getParentWorkflowName } from './naming.js';
export {
  VERDICT,
  CRITICALITY,
  VerdictSchema,
  CriticalitySchema,
  InterpretConfigSchema,
  EvaluatorResultSchema,
  EvalCaseSchema,
  EvalOutputSchema,
  LastOutputSchema,
  LastEvalSchema,
  DatasetSchema
} from './schemas.js';
export type {
  Verdict as VerdictType,
  Criticality,
  InterpretConfig,
  EvaluatorResult,
  EvalCase,
  EvalSummary,
  EvalOutput,
  GroundTruth,
  LastOutput,
  LastEval,
  Dataset
} from './schemas.js';

const sandboxStub = () => {
  throw new Error( 'Judge functions are not available in the Temporal workflow bundle' );
};
export const judgeVerdict = sandboxStub as ( ...args: unknown[] ) => never;
export const judgeScore = sandboxStub as ( ...args: unknown[] ) => never;
export const judgeBoolean = sandboxStub as ( ...args: unknown[] ) => never;
export const judgeLabel = sandboxStub as ( ...args: unknown[] ) => never;
