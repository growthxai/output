---
"@outputai/core": minor
---

Added an optional `extractStepCost` function on `registerProvider`. You pass a function that receives each AI SDK step's `providerMetadata` and returns the dollar amount the gateway charged for that step (or `null` when missing). Metering calls it once per step at bill time, sums the amounts, and writes an `LLMGenerationCost` with `pricingSource: "provider"`. When the function is set for a provider, that provider never uses `models.dev`, has no items and never emits the legacy `cost:llm:request` event. Catalog-priced calls now also include `pricingSource: "models.dev"`.
