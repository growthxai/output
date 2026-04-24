---
"@outputai/cli": patch
"output-api": patch
---

Fix the workflow runs pane in the CLI so the detail view reflects the highlighted run instead of always showing the latest run. `GET /workflow/runs` now includes `runId` per row, and the CLI fetches results via the pinned `GET /workflow/{id}/runs/{rid}/result` endpoint.
