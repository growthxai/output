---
"@outputai/llm": patch
---

Surface Anthropic prompt-cache write tokens (`cacheCreationInputTokens` from `providerMetadata.anthropic`) in the cost calculation, billed as `input_cache_write` at the `cache_write` rate. Falls back to the `input` rate when pricing data lacks a `cache_write` column. Cache reads (`cachedInputTokens`) continue to be billed as `input_cached`.

`.prompt` files can express prompt-caching intent via top-level `providerOptions` (`anthropic.cacheControl`, `openai.promptCacheKey`, `vertex.cachedContent`) — the existing passthrough is now documented in the `output-dev-prompt-file` skill.
