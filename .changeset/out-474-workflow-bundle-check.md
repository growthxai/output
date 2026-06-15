---
"@outputai/core": minor
---

Add an opt-in `output-worker --check` workflow bundle check (and a `@outputai/core/worker` export) that reproduces the worker's webpack bundling without a Temporal server, catching bad workflow imports — e.g. a transitive `node:` built-in — before they crash-loop the worker at startup. `tsc` cannot detect these; only the Temporal bundle can.

- `output-worker --check` (or `OUTPUT_WORKER_CHECK=1`) bundles workflows via the same `bundleWorkflowCode` path `Worker.create` uses, exits non-zero with the offending module named, and needs no Temporal connection or worker env.
- New `@outputai/core/worker` subpath exports `webpackConfigHook`, `loadWorkflows`, `createWorkflowsEntryPoint`, and `bundleWorkflows` for building custom checks.
- Scaffolded projects gain an opt-in `output:worker:check` script plus README/CI guidance (not wired into any build).
