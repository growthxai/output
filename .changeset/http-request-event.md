---
"@outputai/http": minor
---

Emit a new `http:request` event on every HTTP call made via `@outputai/http`'s `fetch`. The event fires on success, non-2xx responses, and network failures, with payload:

```
{
  requestId: string,
  method: string,
  url: string,
  status: number | undefined,
  durationMs: number,
  outcome: 'success' | 'error' | 'failure'
}
```

Subscribers (`on('http:request', handler)`) also receive `workflowId`, `runId`, and `activityId` auto-attached by `emitEvent`. The existing `cost:http:request` event is unchanged — it continues to fire only when a consumer attaches a cost via `addRequestCost()`. Additive — no existing consumer breaks.
