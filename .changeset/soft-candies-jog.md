---
"@outputai/core": patch
---

Improve reliability of workflow usage and cost metadata collection. Transient Temporal signal failures while recording activity attributes are now handled gracefully, reducing the chance of worker interruptions during workflow runs.
