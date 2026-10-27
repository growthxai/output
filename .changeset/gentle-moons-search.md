---
"@outputai/core": minor
---

Added usage and cost tracking for Anthropic and OpenAI provider-native web search. Each billed search is recorded as a `tools` item labeled `web_search`, priced separately from tokens, and included in the normalized generation cost total.
