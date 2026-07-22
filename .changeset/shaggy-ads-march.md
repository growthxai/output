---
"@outputai/core": patch
---

Added `hasErrorType()` workflow tool. It allows to detect if an error has a given Error class in its error chain, either in `.name`, `.type` or `instanceof`. It can be used to test typed errors thrown from activities.
