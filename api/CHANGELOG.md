# output-api

## 0.3.3

### Minor Changes

- Add SSE streaming endpoints `GET /workflow/:id/history/stream` and `GET /workflow/:id/runs/:rid/history/stream` that deliver Temporal workflow history events in real time. Supports automatic reconnect via `Last-Event-ID` and terminates cleanly when the workflow reaches a terminal state.

## 0.3.2

## 0.3.1

## 0.3.0

### Minor Changes

- f1502fb: Add new workflow history endpoint

### Patch Changes

- 8836247: Use `catalog` as the public name for the routing/filtering target across the CLI and HTTP API:

  - `output workflow runs list` gains `--catalog`/`-c` (with `OUTPUT_CATALOG_ID` env fallback) and `GET /workflow/runs` accepts `?catalog=...`, scoping listed runs to a single worker's catalog/session.
  - `output workflow run` and `output workflow start` rename the routing flag to `--catalog`/`-c`. The previous `--task-queue` and `-q` are kept as deprecated aliases (oclif emits a warning when used).
  - `POST /workflow/run` and `POST /workflow/start` accept a `catalog` body field; the previous `taskQueue` field is still accepted as a deprecated alias and the API logs a deprecation warning when it is used.

  Internally the value is still a Temporal task queue — only the user-facing name changes.

- b87b58f: ## Dependencies updates

  ### Vulnerabilities fixed:

  - uuid: Missing buffer bounds check in v3/v5/v6 when buf: (bump to `>=14.0.0`)
  - postcss: PostCSS has XSS via Unescaped </style> in its CSS Stringify Output (bump to `>=8.5.10`)
  - @anthropic-ai/sdk: Claude SDK for TypeScript has Insecure Default File Permissions in Local Filesystem Memory Tool (bump to `>=0.91.1`)

  ### Root package.json updates

  - @changesets/cli: `2.30.0` -> `2.31.0`
  - eslint: `10.2.0` -> `10.2.1`
  - mintlify: `4.2.520` -> `4.2.536`
  - typescript-eslint: `8.58.2` -> `8.59.1`
  - vitest: `4.1.4` -> `4.1.5`

  ### pnpm-workspace.yaml (catalog) updates

  - @aws-sdk/client-s3: `3.1031.0` -> `3.1038.0`

  ### sdk/cli/package.json updates

  - @inquirer/prompts: `8.4.1` -> `8.4.2`
  - @oclif/core: `4.10.5` -> `4.10.6`
  - @oclif/plugin-help: `6.2.44` -> `6.2.45`
  - undici: `8.0.2` -> `catalog:`
  - orval: `8.8.0` -> `8.9.0`

  ### sdk/llm/package.json updates

  - @ai-sdk/amazon-bedrock: `4.0.95` -> `4.0.96`
  - liquidjs: `10.25.5` -> `10.25.7`

- 756d32d: Updating Temporal libraries from `v1.15.0` to `v1.17.0`:
  - @temporalio/activity;
  - @temporalio/client;
  - @temporalio/common;
  - @temporalio/proto (dev dependency for tests);
  - @temporalio/worker;
  - @temporalio/workflow
- 7e1c76d: Fix the workflow runs pane in the CLI so the detail view reflects the highlighted run instead of always showing the latest run. `GET /workflow/runs` now includes `runId` per row, and the CLI fetches results via the pinned `GET /workflow/{id}/runs/{rid}/result` endpoint.

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
