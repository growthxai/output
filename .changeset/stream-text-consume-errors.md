---
"@outputai/llm": minor
---

Functions `streamText()` and `Agent.stream` now throw the provider/stream error when you consume `textStream` or await result promises, instead of succeeding empty or rejecting with `AI_NoOutputGeneratedError`. `onError` still runs first and does not swallow that throw.
