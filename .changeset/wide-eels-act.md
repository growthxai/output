---
"@outputai/llm": patch
---

Refactored `@ai-sdk` provider libraries to be __optional peerDepenedencies__. This means providers are no longer installed with this packages.

The library still supports the same providers:
- @ai-sdk/amazon-bedrock
- @ai-sdk/anthropic
- @ai-sdk/azure
- @ai-sdk/google-vertex
- @ai-sdk/openai
- @ai-sdk/perplexity

But they are now lazy-loaded when calling `generateText()`, `generateImage()` or `streamText()`.
