---
"@outputai/llm": patch
---

Increase built-in LLM provider fetch timeouts for long-running responses.

Default AI SDK `maxRetries` to 0 so workflow retries are handled by Temporal.
