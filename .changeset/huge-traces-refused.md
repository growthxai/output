---
"output-api": minor
"@outputai/cli": minor
---

Added a 256 MB limit to the trace log endpoints, with a signed download URL for bigger files. `GET /workflow/:id/trace-log` and `GET /workflow/:id/runs/:rid/trace-log` check the S3 object size first and never read a trace over 256 MB. They answer `413` with a time-limited `downloadUrl` and `expiresAt` in the body, and `size` and `maxSize` in the body and in the `X-Trace-Size` and `X-Trace-Max-Size` headers. This replaces the `Cannot create a string longer than 0x1fffffe8 characters` failure on very large remote traces. `workflow cost`, `workflow debug`, `workflow dataset generate` and the dev UI steps view now report `Trace file is too big for this feature. Max size 256 MB, file size ...` for these traces.
