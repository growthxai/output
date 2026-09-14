---
"@outputai/core": patch
---

Changed the worker to exit `1` on any shutdown failure, including in-flight work that did not finish before `TEMPORAL_SHUTDOWN_FORCE_TIME`. v0.13.0 exempted an abandoned drain from the failure exit code, which never took effect in practice.
