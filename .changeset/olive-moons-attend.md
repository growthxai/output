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
- `--interval`, `--include-payloads`, and `--color` tune the stream and require `--monitor`.
- `--monitor` cannot be combined with `--json`, which suppresses progress output and prints a single object at the end — that would swallow the whole stream. Use `workflow run --json` to wait for a result, or `workflow monitor --format json` for streaming NDJSON.

The polling loop moved to a shared module so `workflow monitor` and `workflow start --monitor` run the same code path. `workflow monitor` itself is unchanged.
