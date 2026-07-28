---
"@outputai/core": patch
---

Added a mechanism to await for all hook callbacks to complete before shutting down the worker. Max awaiting period is 30s.
