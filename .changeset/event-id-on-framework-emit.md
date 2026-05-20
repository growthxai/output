---
"@outputai/core": minor
---

`emitEvent` now stamps a UUID v4 `eventId` on every emitted payload. Consumers can rely on this field as a stable per-emit idempotency key — e.g., for webhook retry handling, ClickHouse `ReplacingMergeTree` dedup, or any consumer that needs to identify a single emit across retries. The previously emitted `requestId` is not safe for this purpose because `cost:http:request` and `http:request` for the same fetch share a `requestId`.

Callers of `emitEvent` may pass an explicit `eventId` in the payload to override the generated one (intended for deterministic retry scenarios). Additive — existing consumers ignoring the field continue to work.
