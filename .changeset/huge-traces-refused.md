---
"output-api": patch
"@outputai/cli": patch
---

Fixed the trace log endpoints failing with `Cannot create a string longer than 0x1fffffe8 characters` error on very large remote traces. `GET /workflow/:id/trace-log` and `GET /workflow/:id/runs/:rid/trace-log` now check the S3 object size first and never read a trace over 256 MB. They answer `413` with a time-limited signed `downloadUrl` and `expiresAt` in the body, and `size` and `maxSize` in the body and in the `X-Trace-Size` and `X-Trace-Max-Size` headers. `workflow cost`, `workflow debug`, `workflow dataset generate` and the dev UI steps view report `Trace file is too big for this feature. Max size 256 MB, file size ...` for these traces instead of failing.
