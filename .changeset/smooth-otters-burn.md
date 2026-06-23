---
"@outputai/core": patch
---

Added a new `Logger` export for structured logging from both workflows and steps. Logs use the same `message` plus `metadata` shape as the internal worker logger and are routed through the worker's Winston logger.


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
