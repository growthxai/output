---
"@outputai/core": minor
---

Moved models.dev pricing off the LLM billing path onto a Temporal worker background retriever. `calculateCosts` and `metering.bill` are synchronous and never fetch during a call. `pricingFreshness` is now `cached`, `stale`, or `snapshot` only (`live` is removed); snapshot-priced costs stay `imprecise`. Until the worker's first successful refresh, costs use the bundled snapshot. Per-service shutdown logs report `elapsedMs` instead of `shutdownDurationMs`; `Bye` still reports `shutdownDurationMs` for the whole teardown.
