---
"@outputai/core": minor
---

- Added `emit()` to `/hooks` entrypoint to emit custom events. Emitted events can be listened using `on()` and will have their payload wrapped in an envelope:
  ```js
  {
    eventId: string,
    eventDate: number,
    outputActivityKind?: string,
    workflowDetails?: {},
    activityInfo?: {},
    payload: <original emitted payload>
  }
  ```
  Events emitted outside an activity context omit `outputActivityKind`, `workflowDetails`, and `activityInfo`.
- Added the same wrapping envelope to all other events listened to with `on()`: `http:request`, `cost:llm:request`, `cost:http:request`;
- Added internal activity events to activity lifecycle: `onActivityStart`, `onActivityEnd`, `onActivityError`;
- Updated internal triggers so `onError()` no longer receives errors from the internal `$catalog` workflow.
