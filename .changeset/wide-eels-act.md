---
"@outputai/llm": minor
---

- Moved supported `@ai-sdk/*` provider packages to required peer dependencies:
  - `@ai-sdk/amazon-bedrock`: `>=4 <5`
  - `@ai-sdk/anthropic`: `>=3 <4`
  - `@ai-sdk/azure`: `>=3 <4`
  - `@ai-sdk/google-vertex`: `>=4 <5`
  - `@ai-sdk/openai`: `>=3 <4`
  - `@ai-sdk/perplexity`: `>=3 <4`
- Built-in providers are now initialized lazily. Provider packages are imported when `@outputai/llm` is loaded, but provider instances are created only when requested by a prompt.
- No longer re-exports Tavily, Exa, or Perplexity search tool factories.
- `getRegisteredProviders()` was renamed to `getProviderNames()`.
