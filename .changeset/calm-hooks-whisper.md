---
"@outputai/core": patch
---

Fixed `Logger` throwing `Activity context not initialized` when called on a worker outside an activity, such as from lifecycle hooks (`onWorkflowEnd`, `onWorkflowError`). These logs are now emitted without activity fields instead of being lost.
