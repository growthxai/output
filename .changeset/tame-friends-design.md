---
"@outputai/core": patch
---

- Added `@outputai/core/temporal` for worker-side Temporal access that shares the running worker's connection and namespace;
- Added `createTemporalClient()`, which returns a Temporal `Client` for operations on any workflow; do not close `client.connection` — the worker owns it;
- Added `getCurrentWorkflowHandle()`, which returns a handle pinned to the invoking workflow's `workflowId` + `runId` (Temporal Activities only);
- Both helpers throw a non-retryable `FatalError` outside the worker runtime (and outside an activity context for `getCurrentWorkflowHandle()`); never import `@outputai/core/temporal` from `workflow.ts`.
