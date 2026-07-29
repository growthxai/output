---
"@outputai/cli": patch
---

Fix `--json` output on the `workflow start` and `workflow run` commands. `workflow start` did not support `--json` at all and errored on the flag; it now emits the workflow result as JSON. `workflow run --json` corrupted its JSON output when given a scenario argument, because the "Using scenario:" notice was written to stdout; that notice now goes to stderr.

