---
"@outputai/llm": minor
---

- Permanent AI SDK failures now surface in logs, traces, hooks, and workflow results as the original AI SDK error (for example `AI_APICallError`) instead of a wrapping `FatalError` whose message started with `AI-SDK fatal error`.
- Schema-mismatch `NoObjectGeneratedError` messages are no longer rewritten to append `First issue is "…" at path […]`. The AI SDK error (and its Zod cause chain) is returned unchanged.
