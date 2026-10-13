---
"@outputai/core": patch
---

Removed the duplicated cause from step and workflow failures. The `ApplicationFailure` cause is now the error's own `.cause` instead of the error itself, so its message and stack are no longer encoded twice.
