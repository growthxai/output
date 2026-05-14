---
"@outputai/core": minor
---

Added `runId` to the workflow context and the workflow-lifecycle hook payloads. `context.info.runId` exposes the Temporal run id for the current execution attempt; `onWorkflowStart`, `onWorkflowEnd`, and `onWorkflowError` payloads now include `runId` alongside `id` (workflow id). `executionContext` also carries `runId`, so any consumer subscribed via `on(...)` to an `emitEvent`-emitted event (e.g., `cost:llm:request`) receives `runId` automatically. Additive — existing consumers ignoring the field continue to work.
