---
"@outputai/cli": minor
---

Replace the custom `--format json` option with oclif's built-in `--json` flag across all workflow commands (OUT-419).

`--json` suppresses informational logs (e.g. `Fetching result for workflow...`) and emits clean, machine-readable JSON to stdout, fixing output that previously mixed status text into JSON.

**Breaking change:** `--format json` is no longer accepted. Use `--json` instead.

- `workflow result`, `workflow status`, `workflow run`, `workflow cost`, `workflow debug`, `workflow test`: the `--format` flag is removed; pass `--json` for JSON output (text remains the default).
- `workflow list`, `workflow runs list`, `workflow dataset list`: `--format` keeps its non-JSON options (`list`/`table`/`text`); use `--json` for JSON output.

The "update available" banner no longer prints to stdout: it now goes to stderr (keeping stdout clean for piping in every mode) and is suppressed entirely under `--json`.
