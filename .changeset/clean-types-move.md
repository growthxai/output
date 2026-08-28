---
"@outputai/core": minor
---

Moved LLM-specific trace attributes out of `@outputai/core`. Removed `Attribute.LLMUsage` and `Attribute.Usage`, and exposed the generic `Attribute.BaseAttribute` used by package-owned attributes. Import `LLMGenerationUsage`, `LLMGenerationCost`, and the deprecated legacy `LLMUsageEvent` from `@outputai/llm`.
