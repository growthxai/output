---
"@outputai/cli": patch
---

Updated the scaffolded `CLAUDE.md`'s HTTP client convention to point agents at `addRequestCost` from an `afterResponse` hook for paid APIs, and at forwarding cost events via `output-dev-cost-hooks`.
