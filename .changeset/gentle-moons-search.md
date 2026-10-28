---
"@outputai/core": minor
---

Added usage and cost tracking for Anthropic and OpenAI provider-native web search. Each billed search is recorded as a `tools` item, priced separately from tokens, and included in the normalized generation cost total.

Removed Gemini 2 grounding pricing. Its usage is retained as an unpriced `grounding` item, making the normalized cost incomplete. Gemini 3 and 4 grounding remains priced per query.
