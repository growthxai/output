---
"@outputai/cli": patch
---

Surface workflow aliases and honor `OUTPUT_CATALOG_ID` in `output workflow list`.

- The default list output now appends `(aliases: ...)` to workflows that have registered aliases, which previously only appeared in `--format table`/`--format json` (OUT-444).
- Add a `--catalog` flag (env `OUTPUT_CATALOG_ID`) that resolves workflows from a specific catalog, falling back to the server-default catalog — matching the existing behavior of `run` and `start` (OUT-489).
