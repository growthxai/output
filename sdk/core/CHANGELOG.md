# @outputai/core

## 0.5.1

### Patch Changes

- 93f660c: Fix worker activity Temporal client to use the configured namespace when signaling workflows. This resolves unauthorized signal errors in Temporal Cloud production namespaces.
- 8e45051: Improve reliability of workflow usage and cost metadata collection. Transient Temporal signal failures while recording activity attributes are now handled gracefully, reducing the chance of worker interruptions during workflow runs.

## 0.5.0

### Minor Changes

- 43c9293: Workflow runs now return durable usage and cost metadata alongside the workflow output. Each completed or failed run can include raw `attributes` plus convenient `aggregations` for total cost, token usage, and HTTP request counts.

  For example, API and CLI JSON results can now include:

  ```json
  {
    "attributes": [
      {
        "type": "llm:usage",
        "modelId": "gpt-4o",
        "total": 0.00122,
        "tokensUsed": 226
      },
      {
        "type": "http:request:cost",
        "url": "https://api.vendor.com/search",
        "total": 0.42
      }
    ],
    "aggregations": {
      "cost": { "total": 0.42122 },
      "tokens": { "total": 226 },
      "httpRequests": { "total": 1 }
    }
  }
  ```

  Cost events now emit the same attribute-shaped payloads used in workflow results, making hook handlers and saved run metadata easier to reconcile. This also updates `@outputai/http` request cost tracking and `@outputai/llm` response cost data to use the new attribute format.

  Learn more in the [workflow result docs](https://docs.output.ai/api), [CLI result format](https://docs.output.ai/packages/cli#workflow-result-json-format), [cost events guide](https://docs.output.ai/costs/cost-events), and [v0.4.0 to v0.5.0 migration guide](https://docs.output.ai/migrations/v0.4.0-to-v0.5.0).

- d43aa3d: Added `runId` to the workflow context and the workflow-lifecycle hook payloads. `context.info.runId` exposes the Temporal run id for the current execution attempt; `onWorkflowStart`, `onWorkflowEnd`, and `onWorkflowError` payloads now include `runId` alongside `id` (workflow id). `executionContext` also carries `runId`, so any consumer subscribed via `on(...)` to an `emitEvent`-emitted event (e.g., `cost:llm:request`) receives `runId` automatically. Additive — existing consumers ignoring the field continue to work.

### Patch Changes

- ae3ab85: Stream trace JSON when writing local files and uploading to S3, avoiding Node.js string length limits for large trace outputs.

## 0.4.0

### Minor Changes

- 7ccc4fe: Add support for discovering and running workflows from installed npm packages.

  Rename the Output.ai settings property in `package.json` from `output` to `outputai`.

### Patch Changes

- 33928d3: - Fix TypeScript declaration emit for exported workflows that use Zod schemas.
  - Allow TypeScript to generate `.d.ts` files for these workflows without non-portable Zod references.
  - Treat Zod as a peer dependency and avoid leaking schema-specific workflow context types through the invocation config.
- b4a190e: Fixed workflows having the status 'failed' when cancelled via the API/UI. Now they are correctly marked as 'cancelled'.

## 0.3.2

## 0.3.1

## 0.3.0

### Minor Changes

- 899ddaf: - Added new hook functions `onWorkflowStart`, `onWorkflowEnd`, `onWorkflowError`:
  - `onWorkflowStart()`: Triggers when a workflow starts, receives the run id and workflow name;
  - `onWorkflowEnd()`: Triggers when a workflow ends (no error), receives the run id, workflow name and duration (elapsed time);
  - `onWorkflowError()`: Triggers when a workflow throws an error, receives the run id, workflow name, duration and error thrown;
  - Important: These three hooks are not triggered by the internal "$catalog" workflow lifecycle;
  - Renamed `onBeforeStart()` hook to `onBeforeWorkerStart()`;
  - Fixed possible issue where a broken handler attached to `onBeforeStart()` could interrupt the worker process;
  - Added `activityId` and `workflowId` to `onError()` hook handler payload when source is `'activity'`;
  - Added `workflowId` to `onError()` hook handler payload when source is `'workflow'`.

### Patch Changes

- 2809e50: Optimizing local trace to use less memory and avoid "RangeError: Invalid string length"
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
- 0cbee89: Add HTTP and gRPC proxy support for sandbox environments via HTTPS_PROXY and TEMPORAL_GRPC_PROXY env vars
- 23c3ed0: Adding trace event attributes and adding method `addRequestCost` to attach cost related info to an HTTP call made with the http module

## 0.2.0

### Patch Changes

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

- ac8c0f7: Bumping dependency versions

## 0.1.12

### Patch Changes

- 76bcede: Add `agent()` and `skill()` abstractions to `@outputai/llm` for composing reusable LLM agents with structured output and a lazy-loaded skills system. Add `findContentDir()` to `@outputai/core` and fix skill path resolution to be relative to the prompt file rather than the calling module. Add `output-copy-assets` bin to `@outputai/core` to centralise worker asset copying.
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

### Patch Changes

- 2547029: Add `credential:` env var convention for automatic secret resolution at worker startup.

  `core`: add `WORKER_BEFORE_START` lifecycle event and `onBeforeStart` hook.

  `credentials`: add `resolveCredentialRefs()` that resolves `credential:<dot.path>` env vars from encrypted credentials, auto-registered via `onBeforeStart` on import.

  `cli`: scaffold build script now copies `*.key` files to `dist/` alongside `*.yml.enc`.

## 0.1.2

## 0.1.1

### Patch Changes

- ec4c478: Updating dependencies with minor and patch updates.
