---
"output-api": minor
---

Add pinned-run routes and deprecate mutation shortcuts.

New routes: `GET /workflow/:id/runs/:rid/{status,result,trace-log}` and `PATCH/POST /workflow/:id/runs/:rid/{stop,terminate,reset}` allow targeting a specific Temporal run by ID.

The following routes are deprecated (sunset 2026-07-16) and should be migrated to their pinned equivalents:
- `PATCH /workflow/:id/stop` → `PATCH /workflow/:id/runs/:rid/stop`
- `POST /workflow/:id/terminate` → `POST /workflow/:id/runs/:rid/terminate`
- `POST /workflow/:id/reset` → `POST /workflow/:id/runs/:rid/reset`

Deprecated routes emit `Deprecation`, `Sunset`, and `Link` response headers on every call.

**Additive response-shape changes (backwards-compatible):**
- `POST /workflow/run` now includes `runId` in the response
- `POST /workflow/start` now includes `runId` in the response
- `PATCH /workflow/:id/stop` now returns `{ workflowId, runId }` (previously no response body)
- `POST /workflow/:id/terminate` response now includes `runId`
- All status, result, and trace-log responses now include `runId`

## Migration

Replace each deprecated route call with its pinned-run equivalent. You need the `runId` returned from `POST /workflow/run` or `POST /workflow/start` to target a specific run.

```diff
- await fetch(`/workflow/${workflowId}/stop`, { method: 'PATCH' })
+ await fetch(`/workflow/${workflowId}/runs/${runId}/stop`, { method: 'PATCH' })

- await fetch(`/workflow/${workflowId}/terminate`, { method: 'POST' })
+ await fetch(`/workflow/${workflowId}/runs/${runId}/terminate`, { method: 'POST' })

- await fetch(`/workflow/${workflowId}/reset`, { method: 'POST' })
+ await fetch(`/workflow/${workflowId}/runs/${runId}/reset`, { method: 'POST' })
```

If you're using the generated SDK client, regenerate it after upgrading — the deprecated shortcut methods remain callable until 2026-07-16, but will log a `Deprecation` header in responses.
