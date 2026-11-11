---
"@outputai/core": minor
---

Changed the worker to exit `0` when a signal shutdown abandons in-flight work at `TEMPORAL_SHUTDOWN_FORCE_TIME`, instead of `1`. A service failing to stop is logged as a `... failed` warning and no longer affects the exit code, so a routine deploy no longer reports a failure.

Changed Temporal's `Worker failed` log for an expired shutdown force time from an error to a warning. It is dropped when `OUTPUT_TEMPORAL_LOG_LEVEL` is `ERROR`.

Changed `OUTPUT_TEMPORAL_LOG_LEVEL` to be validated at startup. It stays case-insensitive, and an invalid value now fails the worker.

Added shutdown logs: `Shutting down` with the grace, force and hook flush times, a duration on every service stop, and `shutdownDurationMs` on `Bye`. Added a startup warning when the force time is not bigger than the grace time.
