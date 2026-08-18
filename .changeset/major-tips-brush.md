---
"@outputai/llm": patch
---

Fixed `Agent.stream()` and `Agent.generate()` to map AI SDK failures to framework errors consistently with `generateText()`. `Agent.stream()` now also awaits asynchronous stream setup failures.
