---
"@outputai/core": minor
---

- Removed workflow and activity wrappers, so both return their original output;
- Moved trace information to the root workflow's `memo`, in a new format:
  ```json
  {
    "trace": {
      "local": "...",
      "remote": "..."
    }
  }
  ```
- Removed `aggregations` from activity lifecycle and error hook payloads.
- Refactored workflow and activity error handling:
  - Workflow
    - `ContinueAsNew`, throw;
    - Cancellation, throw;
    - `FatalError`/`ValidationError`, create an `ApplicationFailure` and serialize the original error in `.details[0].error`;
    - `TemporalFailure`, throw;
    - Other errors, throw;
  - Activity
    - `CompleteAsyncError`, throw;
    - `TemporalFailure`, throw;
    - Other errors, create an `ApplicationFailure`, serialize the original error in `.details[0].error`, and determine whether it is non-retryable from the error class name and `activityInfo.retryPolicy.nonRetryableErrorTypes`;
- Refactored hook error payloads:
  - Workflow errors are now serialized plain objects that preserve `name`, `message`, `cause`, and additional diagnostic properties;
  - Activity and runtime errors remain `Error` instances;
- Refactored workflow and activity error logs:
  - Workflow
    - `ContinueAsNew`, log a successful workflow end instead of an error;
    - Cancellation, log the serialized error chain without `stack` or Temporal's internal `.failure`;
    - `FatalError`/`ValidationError`, log the serialized original error without `stack`;
    - `TemporalFailure`, log the serialized Temporal error chain without `stack` or `.failure`;
    - Other errors, do not log because Temporal retries the Workflow Task;
  - Activity
    - `CompleteAsyncError`, do not log an error and close the trace node as an asynchronous handoff;
    - `TemporalFailure`, log the serialized error without `stack`;
    - Other errors, log the serialized original error without `stack` before converting it to an `ApplicationFailure`.
