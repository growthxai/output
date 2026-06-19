---
"@outputai/core": minor
---

Add `@outputai/core/logger` — a step logger that auto-attaches workflow execution metadata to logs, so step output is traceable in production (e.g. filterable by `workflowId` in Render).

- `import { logger } from '@outputai/core/logger'` exposes `info`/`warn`/`error`/`debug` (plus a `log` alias) as a drop-in for `console.*` inside steps. Each line is enriched with the current `workflowId`, `runId`, `activityId`, `activityType`, and `workflowType`, matching the framework's own lifecycle logs (structured JSON in production).
- Reads the execution context from `AsyncLocalStorage` at call time; called outside a step it logs without context fields and never throws.
- Use it in steps, evaluators, and shared step code only — not in workflow bodies, which run in a sandbox that cannot load the underlying logger.
