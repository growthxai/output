---
"@outputai/llm": patch
"@outputai/http": patch
---

Route library `console.*` warnings through the framework logger so they're namespaced, structured (JSON in production), and traceable by `workflowId` when emitted inside a step.

- `@outputai/llm`: cost calculation (`LLM Cost`) and prompt config validation (`LLM Prompt`) now log via `createLogger` from `@outputai/core/logger` instead of `console.warn`/`console.error`. The `[output-llm]` message prefix is dropped — the logger namespace replaces it.
- `@outputai/http`: the `addRequestCost()` misuse warning (`HTTP`) now logs via the framework logger.
