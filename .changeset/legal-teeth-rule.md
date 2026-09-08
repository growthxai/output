---
"@outputai/cli": minor
"@outputai/llm": minor
---

Added support for pricing Gemini grounded search, which providers bill per request rather than per token. `LLMGenerationUsage` and `LLMGenerationCost` items gain a `tools` group alongside `input` and `output`, and `LLMGenerationCost` gains a matching `tools` aggregate that is included in `total`. The legacy `cost:llm:request` payload is unchanged and does not carry grounding charges - its shape is frozen, so grounding costs are only visible on the new normalized attribute.

`output workflow cost` prices these tool charges and marks any call with an unpriced charge (grounding or otherwise) with a `*` and a "cost incomplete" footnote, since the reported total understates the actual bill.
