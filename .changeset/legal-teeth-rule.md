---
"@outputai/cli": minor
"@outputai/llm": minor
---

Added support for pricing Gemini grounded search, which providers bill per request rather than per token. `LLMGenerationUsage` and `LLMGenerationCost` items gain a `request` group alongside `input` and `output`, and the legacy `cost:llm:request` payload gains a matching `grounding_query`/`grounding_prompt` line (with `ppm: 0` when the charge can't be priced, so legacy consumers still see that a grounded call happened).

`output workflow cost` prices these request-based charges and marks any call with an unpriced charge (grounding or otherwise) with a `*` and a "cost incomplete" footnote, since the reported total understates the actual bill.
