---
"@outputai/core": patch
---

- Updated error serialization to keep only `name`, `message`, `code` and `stack` for `DOMException` values, instead of also projecting the 25 legacy numeric constants their prototype carries. Aborted operations, whose reason is usually a `DOMException`, now read like any other error in traces and logs.
