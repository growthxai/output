---
"@outputai/core": patch
---

Fix worker activity Temporal client to use the configured namespace when signaling workflows. This resolves unauthorized signal errors in Temporal Cloud production namespaces.
