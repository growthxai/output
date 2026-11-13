---
"@outputai/cli": patch
---

Fixed `--json` errors on the `output workflow` commands. `run`, `start`, `status`, `result`, `list`, `runs list`, `cost`, `debug`, `input`, `test` and `dataset list` used to print a plain-text error and leave nothing structured for scripts to read. They now write `{ "error": { "message", "status", "code" } }` to stderr, with `status` and `code` present only when known, leave stdout empty, and keep their exit codes (1 for API and network failures, 2 and 3 for the usage and monitoring errors of `start`). Text mode is unchanged.
