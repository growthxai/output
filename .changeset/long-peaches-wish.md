---
"@outputai/credentials": minor
"@outputai/core": minor
---

- Added new hook functions `onWorkflowStart`, `onWorkflowEnd`, `onWorkflowError`:
  - `onWorkflowStart()`: Triggers when a workflow starts, receives the run id and workflow name;
  - `onWorkflowEnd()`: Triggers when a workflow ends (no error), receives the run id, workflow name and duration (elapsed time);
  - `onWorkflowError()`: Triggers when a workflow throws an error, receives the run id, workflow name, duration and error thrown;
  - Important: These three hooks are not triggered by the internal "$catalog" workflow lifecycle;
- Renamed `onBeforeStart()` hook to `onBeforeWorkerStart()`;
- Fixed possible issue where a broken handler attached to `onBeforeStart()` could interrupt the worker process;
- Added `activityId` and `workflowId` to `onError()` hook handler payload when source is `'activity'`;
- Added `workflowId` to `onError()` hook handler payload when source is `'workflow'`.
