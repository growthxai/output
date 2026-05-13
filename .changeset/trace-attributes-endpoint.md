---
"@outputai/core": minor
"output-api": minor
---

Added `GET /workflow/{id}/trace-attributes` and `GET /workflow/{id}/runs/{rid}/trace-attributes`, a new API endpoint pair that returns a single aggregated payload — runtime, start/finish timestamps, cost broken down by emitting event name (`cost:llm:request`, `cost:http:request`, `other`), token-usage totals, and the trace S3 URL — for completed workflow runs. Completion-only: returns 424 while the workflow is still running (matching `/result` and `/trace-log`).

Also added `aggregateTraceAttributes` to `@outputai/core/sdk_tracing_tools`, the helper that walks the persisted trace tree and rolls up `attributes.cost` (grouped by node kind) and `attributes.token_usage` (across LLM nodes, with a fallback read of `output.usage` for legacy trace files). Re-exports `buildTraceTree` from the same entrypoint for callers that want to build a tree before aggregating.
