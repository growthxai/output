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

### Patch Changes

- f537949: - Fixed `/run` endpoint response to have the same format as `/result`;
  - Fixed `/status` endpoints `status` field format;
- f13723b: Updating dependencies:

  - @oclif/plugin-help
  - dotenv
  - json-schema-library
  - react
  - redis
  - undici
  - @noble/ciphers
  - @ai-sdk/amazon-bedrock
  - @ai-sdk/anthropic
  - @ai-sdk/azure
  - @ai-sdk/google-vertex
  - @ai-sdk/openai
  - @ai-sdk/perplexity
  - ai
  - liquidjs

  Adding version overrides to fix vulnerabilities:

  - vite@>=7.1.0 <=7.3.1: `>=7.3.2`
  - hono@<4.12.12: `>=4.12.12`
  - hono@>=4.0.0 <=4.12.11: `>=4.12.12`
  - @hono/node-server@<1.19.13: `>=1.19.13`
  - follow-redirects@<=1.15.11: `>=1.16.0`
  - hono@<4.12.14: `>=4.12.14`
  - axios@>=1.0.0 <1.15.0: `>=1.15.0`
  - protobufjs@<7.5.5: `>=7.5.5`

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
