---
"@outputai/core": minor
---

## Trace Changes
- Internal Activity `getTraceDestinations` is no longer invoked when workflow has `disableTrace: true` configuration.
- Workflow trace destinations now omit unavailable destinations instead of returning them as `null`:
  _Before:_
  ```json
  {
    "output": "foo",
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
    "output": "foo",
    "trace": {
      "destinations": {}
    }
  }
  ```
- Internal activities like `getTraceDestinations` and `sendHttpRequest` are no longer omitted in the trace files.
