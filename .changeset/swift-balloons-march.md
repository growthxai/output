---
"@outputai/core": patch
---

Added a mechanism to await for all hook callbacks to complete before shutting down the worker. Max awqaiting period is 30s.
