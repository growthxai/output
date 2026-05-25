---
"output-api": patch
"@outputai/core": patch
---

Raise gRPC's default 4 MiB message-size cap on the Temporal connections used by both the API server and the worker, so workflow result envelopes larger than 4 MiB no longer fail with `RESOURCE_EXHAUSTED`. Configurable via the new `TEMPORAL_GRPC_MAX_MESSAGE_SIZE_BYTES` env var (default 32 MiB) on both processes.
