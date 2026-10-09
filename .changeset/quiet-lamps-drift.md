---
"@outputai/core": minor
"@outputai/cli": patch
---

Folded `@outputai/http` as a feature of `@outputai/core`, under the `@outputai/core/http` entry point. Usage is the same: replace `@outputai/http` imports with `@outputai/core/http`. The `@outputai/http` package is no longer published. Other changes are:

- Added `ky` and `undici` as peer dependencies of `@outputai/core`, and removed `undici` from its regular dependencies.
- Moved `Attribute.HTTPRequestCount` and `Attribute.HTTPRequestCost` from `@outputai/core/sdk/runtime` to `@outputai/core/http` as `HTTPRequestCount` and `HTTPRequestCost`. The `http:request:count` and `http:request:cost` trace attributes are unchanged.
- Removed `@outputai/http` from `@outputai/output`.
- Updated the CLI project templates and agent instructions to use `@outputai/core/http`.
- Changed verbose HTTP tracing (`OUTPUT_TRACE_HTTP_VERBOSE`) to record request and response bodies with the same parsing as `sendHttpRequest()`, so multipart bodies are now stored as base64.

Changed `sendHttpRequest()` response body parsing when `responseOptions.includeBody` is `true`:

- Changed XML, form-urlencoded and JavaScript content types to be returned as text instead of base64.
- Changed empty or invalid JSON bodies to be returned as raw text instead of throwing.
