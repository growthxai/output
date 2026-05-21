---
"@outputai/llm": minor
---

`.prompt` files can now declare prompt-caching intent across Anthropic, OpenAI, and Gemini without dropping into TypeScript.

- Inline `<cache />` and `<cache ttl="1h" />` markers split a message into cached/dynamic parts (Anthropic `cache_control`).
- `<system cache>` / `<user cache="1h">` tag-attribute shorthand marks the whole message for caching.
- A `providerOptions` key inside a tool's frontmatter config attaches to the AI SDK tool definition (Anthropic tool-level caching).
- Anthropic `cacheCreationInputTokens` is now billed as `input_cache_write` at the `cache_write` rate (falls back to `input`).
- Top-level frontmatter `providerOptions.vertex.cachedContent` and `providerOptions.openai.promptCacheKey` continue to flow through unchanged for Gemini and OpenAI caching.
