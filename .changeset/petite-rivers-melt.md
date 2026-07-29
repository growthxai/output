---
"@outputai/cli": patch
---

Fix `--json` output on the `workflow start` and `workflow run` commands. `workflow start` did not support `--json` at all and errored on the flag; it now emits the workflow result as JSON. `workflow run --json` corrupted its JSON output when given a scenario argument, because the "Using scenario:" notice was written to stdout. That notice now goes to stderr, and is suppressed entirely under `--json` so that on success both commands write exactly one JSON object to stdout and nothing else.

