---
"@outputai/cli": patch
---

`workflow cost` now calculates costs from the trace events themselves (the as-charged "Original" cost) and applies `costs.yml` as an override layer (the "Adjusted" cost), displaying both per model and per host. This fixes models with no `costs.yml` entry (e.g. `gpt-5.5`) and HTTP hosts (e.g. `api.exa.ai`, `api.firecrawl.dev`) previously reporting $0, and surfaces where the configured `costs.yml` rate diverges from what was actually charged. The bottom line shows the adjusted total with the as-charged total alongside.

Each call is priced by the best evidence it carries: calls with an `http:request:cost` event are counted as-charged (even on error responses — the event proves a charge), while calls without one are priced from `costs.yml` rules, so traces mixing instrumented and uninstrumented clients lose neither. Only exact (`computed`) recomputes override an event cost — estimates and failed recomputes never do, and a configured `$0` price is now honored. Cached input tokens are charged at the cached rate only (previously also counted at the full input rate on the legacy path).

**`--format json` field changes** (the report shape changed; update any scripts parsing it): `llmTotalCost` → `llmOriginalCost`/`llmAdjustedCost`; `services[]`/`serviceTotalCost` → `httpCosts[]` (grouped by `host`) with `httpOriginalCost`/`httpAdjustedCost`; `unknownModels` removed; per-call `cost`/`warning` → `originalCost`/`adjustedCost`; new `originalTotalCost`; `totalCost` is now the adjusted total.
