---
"@outputai/http": patch
"@outputai/llm": patch
---

Exported event payload types for hook consumers.

- `@outputai/http` now exports `HttpRequestEvent` for `http:request` and `HttpRequestCostEvent` for `cost:http:request`.
- `@outputai/llm` now exports `LLMUsageEvent` for `cost:llm:request`.

Use these with `@outputai/core/hooks` as `on<HttpRequestEvent>( 'http:request', handler )`, so applications can type event-specific fields without redefining the payload shapes locally.
