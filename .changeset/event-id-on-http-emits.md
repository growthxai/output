---
"@outputai/http": patch
---

`cost:http:request` and `http:request` events now carry an `eventId` field (UUID v4) injected by `@outputai/core`'s `emitEvent`. Distinct emits — including the `cost:http:request` and `http:request` events for the same fetch — receive distinct `eventId` values, so downstream dedup keyed on `eventId` works correctly. `requestId` remains unchanged for cross-event correlation (joining a cost event with its corresponding request event).
