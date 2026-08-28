---
"@outputai/llm": minor
---

Added support for passing a loaded or custom `Prompt` object directly to `generateText()`, `generateTextWithStreaming()`, `streamText()`, `generateImage()`, and the `Agent` constructor. Prompt filename strings remain supported; `variables` and `promptDir` apply only when loading a prompt by filename.
