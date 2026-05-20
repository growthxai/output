---
"@outputai/llm": patch
---

`cost:llm:request` events now carry an `eventId` field (UUID v4) injected by `@outputai/core`'s `emitEvent`. No code change required by consumers; subscribers can use `eventId` as an idempotency key.
