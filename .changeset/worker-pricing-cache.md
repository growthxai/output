---
"@outputai/core": minor
---

Moved `models.dev` pricing off the LLM billing path onto a Temporal worker background retriever, so LLM call cost calculation are always based on cache. The `pricingFreshness` value `live` was removed, keeping only `cached`, `stale`, or `snapshot`. Until the worker's first successful refresh, costs use the bundled snapshot.

Updated shutdown logs to include the new service `LLMPricingRetriver` and other small cosmetic message updates.
