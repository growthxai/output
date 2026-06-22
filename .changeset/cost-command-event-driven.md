---
"@outputai/cli": patch
---

`workflow cost` now calculates costs from the trace events themselves (the as-charged "Original" cost) and applies `costs.yml` as an override layer (the "Adjusted" cost), displaying both per model and per host. This fixes models with no `costs.yml` entry (e.g. `gpt-5.5`) and HTTP hosts (e.g. `api.exa.ai`, `api.firecrawl.dev`) previously reporting $0, and surfaces where the configured `costs.yml` rate diverges from what was actually charged. The bottom line shows the adjusted total with the as-charged total alongside.

Costs come exclusively from trace cost attributes: LLM nodes with an `llm:usage` event and HTTP calls with an `http:request:cost` event are counted as-charged (even on error responses — the event proves a charge); calls without events are not priced. Traces from SDK versions that predate cost attributes (< 0.5) report no costs. Only exact (`computed`) recomputes override an event cost — estimates and failed recomputes never do, and a configured `$0` price is now honored. Body-dependent `costs.yml` service rules require traces recorded with `OUTPUT_TRACE_HTTP_VERBOSE=true` (the dev default).

**`--format json` field changes** (the report shape changed; update any scripts parsing it): `llmTotalCost` → `llmOriginalCost`/`llmAdjustedCost`; `services[]`/`serviceTotalCost` → `httpCosts[]` (grouped by `host`) with `httpOriginalCost`/`httpAdjustedCost`; `unknownModels` removed; per-call `cost`/`warning` → `originalCost`/`adjustedCost`; new `originalTotalCost`; `totalCost` is now the adjusted total.
