---
"@outputai/cli": patch
"output-api": patch
---

Use `catalog` as the public name for the routing/filtering target across the CLI and HTTP API:

- `output workflow runs list` gains `--catalog`/`-c` (with `OUTPUT_CATALOG_ID` env fallback) and `GET /workflow/runs` accepts `?catalog=...`, scoping listed runs to a single worker's catalog/session.
- `output workflow run` and `output workflow start` rename the routing flag to `--catalog`/`-c`. The previous `--task-queue` and `-q` are kept as deprecated aliases (oclif emits a warning when used).
- `POST /workflow/run` and `POST /workflow/start` accept a `catalog` body field; the previous `taskQueue` field is still accepted as a deprecated alias and the API logs a deprecation warning when it is used.

Internally the value is still a Temporal task queue — only the user-facing name changes.
