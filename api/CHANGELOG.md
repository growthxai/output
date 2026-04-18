# output-api

## 0.2.0

### Minor Changes

- d19646c: Add pinned-run routes and deprecate mutation shortcuts.

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

## 0.1.12

### Patch Changes

- 3ed2168: Add support for Workflow alias names

## 0.1.11

## 0.1.10

### Patch Changes

- 41ecc1b: Updating dependencies to latest and overriding version to fix vulnerabilities

## 0.1.9

## 0.1.8

## 0.1.7

### Patch Changes

- ac7fc2b: Bumping dependecies minor, patch versions

## 0.1.6

## 0.1.5

## 0.1.4

### Patch Changes

- b9b986d: Patching vulnerable dependencies

## 0.1.3

## 0.1.2

## 0.1.1

### Patch Changes

- ec4c478: Updating dependencies with minor and patch updates.
