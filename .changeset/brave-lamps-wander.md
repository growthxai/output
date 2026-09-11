---
"@outputai/core": minor
---

Hardened worker startup and shutdown around the catalog workflow.

- Changed catalog reconciliation to terminate a stale catalog instead of asking it to complete, so a catalog that stopped processing workflow tasks no longer fails every deploy that follows it.
- Increased the catalog workflow task timeout to 30s, enough for a cold worker bundle to activate.
- Added two retries when publishing the catalog before failing the worker.
- Added a startup gate so a worker never starts unless its catalog matches its own source code.
- Changed the worker to always exit explicitly: `0` for a signal shutdown, `1` for a startup failure, a lost connection, an uncaught error, or a worker that failed to stop. A drain the worker had to abandon is not a failure - it is the bound working as intended - so it exits `0` and records a `Stopping Worker error` warning carrying the `GracefulShutdownPeriodExpiredError`.
- Added graceful draining for uncaught exceptions and unhandled rejections, with a force quit if the drain stalls.
- Fixed kill signals during startup killing the process abruptly, since the handler was only installed once the worker was built.
- Added defaults for `TEMPORAL_SHUTDOWN_GRACE_TIME` (`15s`) and `TEMPORAL_SHUTDOWN_FORCE_TIME` (`20s`), so a wedged drain now ends under the worker's own control instead of waiting for the platform to `SIGKILL` it. Both were previously unset, which left the drain unbounded and meant the hook flush was never reached on a deploy that caught in-flight work. Raise them together with your platform's shutdown delay if your activities need longer.
- Added `OUTPUT_HOOK_FLUSH_TIMEOUT_MS` (`5000`) for the hook flush allowance, previously hardcoded at `30000`. The flush runs after the drain, so force time plus flush timeout is the worst-case shutdown and has to fit your platform's window: the defaults total 25s against the 30s most platforms allow. At the old 30s the flush could not complete on a default window.
