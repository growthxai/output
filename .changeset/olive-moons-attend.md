---
"@outputai/cli": minor
---

## `workflow start --monitor`

Added a `--monitor` (`-m`) flag to `output workflow start` that attaches and streams step updates as soon as the workflow is started, so you no longer have to copy the workflow ID into a separate `workflow monitor` call.

```bash
output workflow start lead_enrichment --input ./test_input.json --monitor
```

- Monitoring is pinned to the run id returned by `start`, so a rapid re-start can't leave you watching a different execution.
- Behavior matches `workflow monitor`: Ctrl+C detaches without stopping the workflow (exit `130`), and a failed workflow exits `1`.
- If the stream itself drops after the workflow was started, the command reports that the workflow is still running and exits `3` — distinct from `1`, so retry logic keyed on a failed workflow can't re-submit one that is already in flight.
- `--interval`, `--include-payloads`, and `--color` tune the stream and require `--monitor`.
- `--monitor` cannot be combined with `--json`, which suppresses progress output and prints a single object at the end — that would swallow the whole stream. Use `workflow run --json` to wait for a result, or `workflow monitor --format json` for streaming NDJSON.

The polling loop moved to a shared module so `workflow monitor` and `workflow start --monitor` run the same code path. Two fixes fall out of that for `workflow monitor` as well: a transient failure on the *first* poll is now retried like any other (it used to abort immediately), and Ctrl+C waits for output to flush before exiting, so a piped session can't lose its last lines. Detaching now also names `workflow status`/`workflow result` for the run you left behind.
