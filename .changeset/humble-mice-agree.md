---
"@outputai/core": patch
---

Added activity lifecycle hooks: `onActivityStart`, `onActivityEnd`, `onActivityError`.

Payload:
```ts
{
  eventId: string,
  eventDate: number,
  workflowDetails: object, // Serialized and simplified Temporal's workflowInfo() return
  activityInfo: object, // Temporal's activityInfo() return
  outputActivityKind: string, // Kind of activity: step, evaluator, etc
  aggregations: object // Total cost, http calls and tokens used in the activity (only present in End/Error events)
}
```
