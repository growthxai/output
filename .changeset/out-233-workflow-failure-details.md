---
"output-api": patch
---

Expose structured workflow failure details (`failure` object with `message`, `type`, `retryable`, and a sanitized `cause` chain) in `/workflow/run` and `/workflow/:id/result` responses, alongside the existing `error` string. Also log Temporal/gRPC client errors with full nested context (cause chain, gRPC `code`/`details`, redacted metadata keys, `workflowId`/`runId`/`taskQueue`/query) while keeping client-facing HTTP responses sanitized.
