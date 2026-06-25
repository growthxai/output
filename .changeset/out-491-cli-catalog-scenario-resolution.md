---
"@outputai/cli": minor
---

CLI `start`/`run`/`test`/`dataset generate` now resolve scenarios and route execution against `--catalog`/`OUTPUT_CATALOG_ID` instead of the API server's default catalog. This removes the ~30s scenario-resolution stall in worktrees where the default catalog has no worker polling it. `workflow test` and `workflow dataset generate` also gain a `--catalog` flag (env: `OUTPUT_CATALOG_ID`), matching `list`/`start`/`run`.
