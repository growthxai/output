---
"@outputai/core": minor
---

Made the worker's memory sizing visible, and deferred the workflow concurrency defaults to `@temporalio/worker`:

- Added `TEMPORAL_WORKFLOW_THREAD_POOL_SIZE`. Each workflow thread is a V8 isolate and a `NODE_OPTIONS` heap cap applies per isolate, so this multiplies the heap the process can commit. Left unset by default.
- Removed the `TEMPORAL_MAX_CACHED_WORKFLOWS` default of `1000`. The cache is now sized from the isolate's heap limit, so it scales with the container rather than holding a fixed value. The upstream formula assumes roughly 600 cached workflows per GB, so deployments with heavier workflow payloads should set this explicitly.
- Removed the `TEMPORAL_MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS` default of `200`, which now falls back to the upstream default of `40`.
- Added a `Worker isolates` log at startup reporting the isolate count, heap limit, projected committed heap, container limit, resolved cache size, and workflow task slots. It warns when the isolates may commit more heap than the container allows, or when there are more task slots than cache entries.
- Added `nonMainHeap` and `heapSizeLimit` to the worker telemetry memory samples, so resident memory outside the main isolate is visible rather than inferred.

`TEMPORAL_MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS` and the poll settings are unchanged.
