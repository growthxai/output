---
"@outputai/llm": patch
---

Fixed `Agent.stream()` and `Agent.generate()` to map AI SDK failures to framework errors consistently with `generateText()`. Non-retryable AI SDK failures now become `TransparentFatalError`, so affected activities fail without retrying. `Agent.stream()` now also awaits asynchronous stream setup failures.
