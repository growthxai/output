---
"@outputai/core": minor
"@outputai/cli": patch
---

Folded `@outputai/evals` as a feature of `@outputai/core`, under the `@outputai/core/evals` entry point. Replace `@outputai/evals` imports with `@outputai/core/evals`, except for the LLM judges, which moved to `@outputai/core/llm`. The `@outputai/evals` package is no longer published. Other changes are:

- Moved `judgeVerdict`, `judgeScore`, `judgeBoolean`, `judgeLabel` and the `JudgeArgs` type to `@outputai/core/llm`. Their arguments and results are unchanged.
- Removed `interpretResult`, `aggregateCaseVerdict`, `renderEvalOutput`, `computeExitCode`, `getEvalWorkflowName`, `isEvalWorkflow` and `getParentWorkflowName` from the public API. They were used internally by the eval workflow and the CLI.
- Removed the internal Zod schemas from the public API. `DatasetSchema` and `EvalOutputSchema` are still exported, along with the `VERDICT` and `CRITICALITY` values and the eval types.
- Changed the workflow bundler to replace steps and evaluators that are referenced as values in workflow files, rather than called, with their activity names, and to strip their imports. Previously their modules were bundled into the workflow sandbox when the file had no activity calls.
- Removed `@outputai/evals` from `@outputai/cli`.
