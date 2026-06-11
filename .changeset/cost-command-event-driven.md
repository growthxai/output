---
"@outputai/cli": patch
---

`workflow cost` now calculates costs from the trace events themselves (the as-charged "Original" cost) and applies `costs.yml` as an override layer (the "Adjusted" cost), displaying both per model and per host. This fixes models with no `costs.yml` entry (e.g. `gpt-5.5`) and HTTP hosts (e.g. `api.exa.ai`, `api.firecrawl.dev`) previously reporting $0, and surfaces where the configured `costs.yml` rate diverges from what was actually charged (e.g. `claude-opus-4-8` priced via the `claude-opus-4` prefix). The bottom line shows the adjusted total with the as-charged total alongside.
