---
"@outputai/core": minor
---

Hardened worker startup and shutdown around the catalog workflow.

- Changed catalog reconciliation to terminate a stale catalog instead of asking it to complete, so a catalog that stopped processing workflow tasks no longer fails every deploy that follows it.
- Increased the catalog workflow task timeout to 30s, enough for a cold worker bundle to activate.
- Added two retries when publishing the catalog before failing the worker.
- Added a startup gate so a worker never starts unless its catalog matches its own source code.
- Changed the worker to always exit explicitly: `0` once a signal shutdown has drained, `1` for a startup failure, a lost connection, an uncaught error, or a drain the worker had to abandon. A deploy that outruns the drain window now exits `1` on its own instead of ending in a platform `SIGKILL`.
- Added graceful draining for uncaught exceptions and unhandled rejections, with a force quit if the drain stalls.
- Fixed kill signals during startup killing the process abruptly, since the handler was only installed once the worker was built.
- Added defaults for `TEMPORAL_SHUTDOWN_GRACE_TIME` (`20s`) and `TEMPORAL_SHUTDOWN_FORCE_TIME` (`25s`), so a wedged drain now ends under the worker's own control instead of waiting for the platform to `SIGKILL` it. Both were previously unset, which left the drain unbounded. Raise them together with your platform's shutdown delay if your activities need longer.
