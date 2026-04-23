---
"@outputai/http": patch
---

## Custom fetch
Added a `fetch` function export to the "http" module:
- Fully compliant with the fetch [spec](https://fetch.spec.whatwg.org/);
- Integrates with Traces, tracking requests, responses, errors and failures;

## Updated http client
Refactored `httpClient` exported by "http" to use the custom _fetch_ internally instead of _ky_ hooks.
