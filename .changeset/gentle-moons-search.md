---
"@outputai/core": minor
---

Added usage and cost tracking for Anthropic and OpenAI provider-native web search, plus Google Search grounding pricing for Gemini 4. Each billed search is recorded as a `tools` item, priced separately from tokens, and included in the normalized generation cost total.
