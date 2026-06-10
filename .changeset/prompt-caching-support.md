---
"@outputai/llm": minor
---

Add per-message prompt caching to `.prompt` files.

- `cache` shorthand on a block (`<system cache>`, `<system cache="1h">`) sets an Anthropic cache breakpoint covering the prompt prefix up to and including that block.
- General `messageOptions` named sets in front matter, attached to blocks via `options="<name>"`, attach arbitrary per-message `providerOptions`.
- `cache` resolves to `anthropic.cacheControl` for `provider: anthropic` and Claude models on `vertex`; for other providers it is ignored with a warning (use `messageOptions` with that provider's namespace).
