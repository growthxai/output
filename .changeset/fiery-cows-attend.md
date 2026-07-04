---
"output-api": minor
---

Workflow result endpoints no longer include unavailable trace destinations instead of returning them as `null`.
This affects:
- `POST /workflow/run`
- `GET /workflow/{id}/result`
- `GET /workflow/{id}/runs/{rid}/result`

_Before:_
```json
{
  ...
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
  ...
  "trace": {
    "destinations": {}
  }
}
```
