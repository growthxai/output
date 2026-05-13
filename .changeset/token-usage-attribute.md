---
"@outputai/core": minor
"@outputai/llm": minor
---

Added `Tracing.Attribute.TOKEN_USAGE` (`'token_usage'`) and a parallel `token_usage:llm:request` event emitted from `endTraceWithSuccess`. LLM trace nodes now carry token usage under `attributes.token_usage` instead of `output.usage`; the duplicate `usage` field is no longer written into the LLM trace `output`. The existing `cost:llm:request` event and `attributes.cost` are unchanged.
