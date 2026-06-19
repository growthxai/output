---
"@outputai/core": minor
---

Attach workflow execution context to every log emitted inside an activity, including the framework's own internal step logs.

- A `contextFormat` on the root logger reads the execution context from `AsyncLocalStorage` at log time, so any `createChildLogger` line emitted inside a step/evaluator/internal step is enriched with `workflowId`, `runId`, `activityId`, `activityType`, and `workflowType`. Caller-supplied fields win; logs outside an activity (worker startup, monitoring) are untouched.
- The internal HTTP client step (`HttpClient` "HTTP request completed") is now traceable by `workflowId` in production, same as user step logs.
- `@outputai/core/logger` keeps the same behavior and output; its context injection now comes from the shared root format instead of a per-call wrapper.
