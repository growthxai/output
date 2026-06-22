---
"@outputai/llm": minor
---

Add per-message provider options to `.prompt` files via `messageOptions`.

- Define named `messageOptions` sets in front matter and attach them to message blocks with `options="<name>"` (e.g. `<system options="cached">`); each set is a provider-namespaced `providerOptions` object merged onto that message.
- Enables Anthropic prompt caching (`{ anthropic: { cacheControl: { type: ephemeral } } }`) and any other per-message provider option, on any provider.
- Cost tracking now reports cached input tokens (`input_cached`) even for models whose pricing record lacks a `cache_read` rate, so cache savings are visible in usage aggregations instead of silently disappearing.
