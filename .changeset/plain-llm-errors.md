---
"@outputai/llm": minor
---

- Permanent AI SDK failures now appear in logs, traces, hooks, and workflow results as the original AI SDK error (for example `AI_APICallError` or `NoObjectGeneratedError`) instead of a wrapping `FatalError`.
