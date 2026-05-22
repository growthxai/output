---
"@outputai/core": patch
"@outputai/llm": patch
"@outputai/http": patch
---

Every payload emitted through the framework's `messageBus` now carries a UUID v4 `eventId` — stamped at the bus layer, so events emitted via `emitEvent` *and* lifecycle hook payloads (`onWorkflowStart`, `onWorkflowEnd`, `onWorkflowError`, `onError`) both receive it. Consumers can rely on `eventId` as a stable per-emit idempotency key — e.g., for webhook retry handling, ClickHouse `ReplacingMergeTree` dedup, audit logs. The previously emitted `requestId` is not safe for this purpose because `cost:http:request` and `http:request` for the same fetch share a `requestId`.

Callers may pre-set `eventId` on the payload to override the generated one (intended for deterministic retry scenarios). Additive — existing consumers ignoring the field continue to work.
