---
"@outputai/llm": minor
---

Added `generateTextWithStreaming()` and `Agent.generateWithStreaming()`, which return complete results like `generateText()` and `Agent.generate()` while using streaming internally. Callers can observe the stream through `onChunk`, `onFinish`, and `onError`, while failures still reject the returned promise.
