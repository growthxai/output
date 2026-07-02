# @outputai/http

HTTP client with built-in tracing for Output Framework workflows.

[![npm version](https://img.shields.io/npm/v/@outputai/http)](https://www.npmjs.com/package/@outputai/http)

## Documentation
- [README](https://docs.output.ai/packages/http)
- [API Reference](https://output-ai-reference-code-docs.onrender.com/modules/http_src.html)

## Response Body Ownership

`@outputai/http` follows normal `fetch` semantics: callers must consume returned response bodies or cancel them when unused.
If a non-`HEAD` request only reads metadata such as `response.url`, `response.status`, or headers, call
`await response.body?.cancel()` in a `finally` block.

<!-- Internal Dev Note: The documentation for this package is found at docs/guides/packages/http.mdx -->
