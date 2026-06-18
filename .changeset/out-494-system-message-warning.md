---
"@outputai/llm": patch
---

Route `<system>` blocks to the AI SDK `system` option instead of leaving them in the `messages` array.

- `loadAiSdkTextOptions` now splits resolved messages: system blocks go to the top-level `system` option (as `SystemModelMessage[]`, so per-message `cacheControl`/`providerOptions` are preserved); only user/assistant/tool messages stay in `messages`. `Agent` consumes the split `system` directly as its `instructions`.
- Silences the AI SDK warning that system messages in `messages` are a prompt-injection risk; `generateText`/`streamText`/`Agent` also set `allowSystemInMessages: true` as defense-in-depth for caller-supplied message histories.
