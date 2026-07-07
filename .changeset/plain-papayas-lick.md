---
"@outputai/cli": minor
---

The JSON output for workflow result commands no longer includes unavailable trace destinations as `null`.
This affects:
- `output workflow run ... --json`
- `output workflow result <workflow-id> --json`

_Before:_
```json
{
  "trace": {
    "destinations": {
      "local": null,
      "remote": null
    }
  }
}
```

_After:_
```json
{
  "trace": {
    "destinations": {}
  }
}
```
