---
"@outputai/core": patch
---

Added a new `Logger` export for structured logging from both workflows and steps. Logs use the same `message` plus `metadata` shape as the internal worker logger and are routed through the worker's Winston logger.

All log messages are enriched with execution metadata:
- Workflow logs include `workflowType`, `workflowId`, and `runId`.
- Step logs include the same workflow fields, plus `activityType` and `activityId`.

```ts
import { Logger } from '@outputai/core';

Logger.info( 'I am a log', { extraInfo: 'none' } ); // workflows inside workflow and steps
```

Supported levels are:
- error
- warn
- info
- http
- verbose
- debug
- silly

The default displayed level is debug in development and info in production. Override it with `OUTPUT_LOG_LEVEL` env var. This setting also affects internal worker logs.
