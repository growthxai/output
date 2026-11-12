---
"@outputai/core": patch
---

Fixed Temporal worker logs showing `error: {}` by serializing `Error` values in Temporal log metadata, so failures like `Worker failed` now log their message and stack.
