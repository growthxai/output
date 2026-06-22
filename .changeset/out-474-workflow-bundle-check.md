---
"@outputai/core": patch
---

Add an opt-in `output-worker --check` workflow bundle check that reproduces the worker's webpack bundling without a Temporal server, catching bad workflow imports — e.g. a transitive `node:` built-in — before they crash-loop the worker at startup. `tsc` cannot detect these; only the Temporal bundle can.

- `output-worker --check` bundles workflows via the same `bundleWorkflowCode` path `Worker.create` uses, exits non-zero with the offending module named, and needs no Temporal connection or worker env.
- Scaffolded projects gain an opt-in `output:worker:check` script plus README/CI guidance (not wired into any build).
