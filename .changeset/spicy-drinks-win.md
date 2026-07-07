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

## HTTP helper header changes
- Both `sendHttpRequest` and `sendPostRequestAndAwaitWebhook` can now interpolate environment variable values in header values:
  ```js
  sendHttpRequest( {
    url,
    headers: {
      Authorization: 'Bearer $TOKEN'
    }
  } );
  ```
  When executing this request, `$TOKEN` will be replaced by the value of `process.env.TOKEN`.


## sendHttpRequest output changes
- The response of `sendHttpRequest` no longer includes body or headers by default. Use the `responseOptions` argument to configure this:
  ```js
  sendHttpRequest( {
    url,
    responseOptions: {
      includeHeaders: true,
      includeBody: true
    }
  } );
  ```
- Response headers included via `responseOptions.includeHeaders` are redacted by header name. This covers common sensitive header names such as authorization, token, secret, password, cookie, and key, but it is a best-effort heuristic.
