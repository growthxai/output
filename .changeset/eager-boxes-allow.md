---
"@outputai/core": minor
---

## Workflow hooks
Updated `onWorkflowStart()`, `onWorkflowEnd()`, `onWorkflowError()` hooks payload:

```js
{ eventId, workflowDetails, error? }
```

Where `workflowDetails` is an abstraction over [Temporal's `workflowInfo()`](https://typescript.temporal.io/api/interfaces/workflow.WorkflowInfo):
```ts
{
  attempt: number,
  continuedFromExecutionRunId?: string | undefined,
  firstExecutionRunId: string,
  parent?: {
    runId: string
    workflowId: string
    namespace: string
  } | undefined,
  root?: {
    runId: string
    workflowId: string
  } | undefined,
  runId: string,
  runStartTime: number, // epoch
  startTime: number, // epoch
  workflowId: string,
  workflowType: string
}
```

## Error hook
Updated `onError()` hooks payload. The fields change according to the `source`:

### Source is "workflow"
```js
{ eventId, source, workflowDetails, error }
```
Where `workflowDetails` is the same as in workflow hooks.

### Source is "activity"
```js
{ eventId, source, workflowDetails, activityInfo, outputActivityKind, error }
```

Where `activityInfo` is Temporal's `activityInfo()` [function return](https://typescript.temporal.io/api/interfaces/activity.Info).

And `outputActivityKind` is the framework flavor of the Temporal Activity: `step`, `evaluator` or `internal_step`.

### Source is "runtime"
```js
{ eventId, source, error }
```

## "on()" hook
Updated `on()` hooks with better typing and a new envelope.

### Envelope
All events have these fields:
- `eventId`
- `workflowDetails`: Same from other hooks
- `activityInfo`: From Temporal
- `outputActivityKind`

### Typing
Besides the envelope fields, each event also has its own fields, their types are specified by the event emitter:
- `on<HttpRequestEvent>( 'http:request', handler )` from `@outputai/http`;
- `on<HttpRequestCostEvent>( 'cost:http:request', handler )` from `@outputai/http`;
- `on<LLMUsageEvent>( 'cost:llm:request', handler )` from `@outputai/llm`

## Execution Context
Updated `getExecutionContext()` from core/sdk_activity_integration to return:
```js
{ activityInfo, workflowFilename }
```

## Trace File
Updated trace workflow node ids to use Temporal `runId`, instead of `workflowId`. This helps to create trees when child workflows "continued as new".
