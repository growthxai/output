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
- `POST /workflow/start` now includes `runId` in the response
- `PATCH /workflow/:id/stop` now returns `{ workflowId, runId }` (previously empty body)
- `POST /workflow/:id/terminate` now returns `{ terminated, workflowId, runId }` (previously no `runId`)
- All status, result, and trace-log responses now include `runId`
