---
"@outputai/llm": minor
---

Added `generateTextWithStreaming()` and `Agent.generateWithStreaming()`, which return complete results like `generateText()` and `Agent.generate()` while using streaming internally. Callers can observe progress through `onChunk`. Failures reject the returned promise.
