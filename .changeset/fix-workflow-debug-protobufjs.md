---
'@outputai/cli': patch
---

Fixed `workflow debug` failing with `type must be a Type` when the install has more than one `protobufjs` copy. History events still use Temporal's JSON form (ISO times, duration strings, decoded payloads).
