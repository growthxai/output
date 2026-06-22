---
"@outputai/core": patch
---

- Updating connection monitor strategy to ping workflowService instead of healthService.
- Adding new env vars to configure Temporal worker shutdownForceTime and shutdownGraceTime:
  - TEMPORAL_SHUTDOWN_FORCE_TIME
  - TEMPORAL_SHUTDOWN_GRACE_TIME
