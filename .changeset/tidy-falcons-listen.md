---
"@outputai/core": minor
---

Added worker memory sizing diagnostics and deferred the workflow concurrency defaults to `@temporalio/worker`.

### Worker isolates startup log

Added a `Worker isolates` record, logged once at startup with the thread pool size, `reuseV8Context`, the isolate count, the per-isolate heap limit, the heap all isolates could commit together, the host's memory limit, the resolved cache size, and the workflow task slot count.

Warns when the projected heap exceeds the host's memory limit, and when there are more workflow task slots than cache entries, which causes tasks to evict each other's workflows and forces history replays.

Accounts for `NODE_OPTIONS` heap caps applying per isolate rather than per process: a worker runs one V8 isolate on its main thread plus one per workflow thread, so the heap it can commit is a multiple of the cap.

### Periodic telemetry

- Added `memory.nonMainHeap` (`rss - heapUsed`): resident memory outside the main isolate's live objects, including workflow thread heaps, Rust core allocations, and heap pages V8 has committed but not filled. Cached workflow memory is counted here.
- Added `memory.heapSizeLimit`, the per-isolate heap ceiling, to each sample.
- Renamed `memory.constrainedMemory` to `memory.memoryLimit` and changed what it reports. `process.constrainedMemory()` returns a sentinel near 2^64 rather than `0` when the process is unconstrained, so the old field was not usable outside a memory-capped container. `memoryLimit` falls back to the machine's total memory. Anything parsing the old field needs updating.

### Environment variables

- Added `TEMPORAL_WORKFLOW_THREAD_POOL_SIZE`, the number of threads running workflow sandboxes, which sets the number of isolates. Unset by default.
- Removed the `TEMPORAL_MAX_CACHED_WORKFLOWS` default of `1000`. When unset, the cache is sized from the isolate's heap limit instead of a fixed value. That formula assumes roughly 600 cached workflows per GB, so deployments with heavier payloads should set it explicitly.
- Removed the `TEMPORAL_MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS` default of `200`. When unset, it falls back to the upstream default of `40`.
