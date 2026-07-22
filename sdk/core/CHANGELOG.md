# @outputai/core

## 0.11.0

### Minor Changes

- eaf62a3: ## Workflow Activity Invocation

  - Refactored workflow activity invocation so steps, evaluators, and shared activities use the same runtime dispatcher
    instead of `this`-based handler dispatch.

    Workflow handlers no longer need to be rewritten from arrow functions into regular functions for activity dispatch,
    reducing AST rewrite complexity during worker startup and making bundling more predictable.

  - Step and evaluator calls can now be placed in helper functions and imported helper modules used by a workflow.
    Helpers no longer need to pass a workflow-bound `this` value through their call chain.

  ## Child Workflow Activity Options

  - A child workflow's definition-level `options.activityOptions` now override activity options inherited from its parent. Invocation-level `activityOptions` still override both, and a step or evaluator's own `options.activityOptions` remain the most specific.

  - If a parent must override a child's retry or timeout configuration, pass `activityOptions` explicitly when invoking the child workflow.

  ## Shared Activity Namespaces

  - Removed the previous `"$shared"` activity namespace by registering shared activities into each workflow namespace. This means workflows can call local and shared activities through the same activity resolution path.

  - Shared activity types now use `"<workflow-name>#<activity-name>"` instead of `"$shared#<activity-name>"`.

  - Added validation that prevents workflow-scoped activities from using the same activity name as a shared activity. If a workflow defines an activity with the same name as a shared activity, worker startup now fails validation instead of allowing ambiguous activity resolution.

  ## Workflow Code Validation

  - Added fail-fast validation for default exports and `export *` declarations in steps/evaluators files. Steps and evaluators already needed to be exposed through named exports for workflow rewriting. The worker now reports these unsupported forms directly during startup.

    ```js
    // valid
    export const foo = step({ name: "foo" });

    // invalid
    export default step({ name: "foo" });
    export * from "./other_steps.js";
    ```

  - Added fail-fast validation for unsupported steps/evaluators import shapes. Imports from steps/evaluators files already needed to use named imports or destructured requires for workflow rewriting.

    The worker now fails fast with a validation error for unsupported import shapes like default imports, namespace imports, or non-destructured requires.

    ```js
    // valid
    import { foo } from "./steps.js";
    const { bar } = require("./evaluators.js");

    // invalid
    import foo from "./steps.js";
    import * as steps from "./steps.js";
    const steps = require("./steps.js");
    ```

  - Added validation that activity calls must happen inside functions.
    Calling a step or evaluator at module top level now fails validation.

    ```js
    import { foo } from "./steps.js";

    // invalid
    foo();
    ```

- d815a8e: - Added `emit()` to `/hooks` entrypoint to emit custom events. Emitted events can be listened using `on()` and will have their payload wrapped in an envelope:
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

## 0.10.0

### Minor Changes

- c318502: ## Trace Changes

  - Internal Activity `getTraceDestinations` is no longer invoked when workflow has `disableTrace: true` configuration.
  - Workflow trace destinations now omit unavailable destinations instead of returning them as `null`:
    _Before:_
    ```json
    {
      "output": "foo",
      "trace": {
        "destinations": {
          "local": null,
          "remote": null
        }
      }
    }
    ```
    _After:_
    ```json
    {
      "output": "foo",
      "trace": {
        "destinations": {}
      }
    }
    ```
  - Internal activities like `getTraceDestinations` and `sendHttpRequest` are no longer omitted in the trace files.

  ## HTTP helper header changes

  - Both `sendHttpRequest` and `sendPostRequestAndAwaitWebhook` can now interpolate environment variable values in header values:
    ```js
    sendHttpRequest({
      url,
      headers: {
        Authorization: "Bearer $TOKEN",
      },
    });
    ```
    When executing this request, `$TOKEN` will be replaced by the value of `process.env.TOKEN`.

  ## sendHttpRequest output changes

  - The response of `sendHttpRequest` no longer includes body or headers by default. Use the `responseOptions` argument to configure this:
    ```js
    sendHttpRequest({
      url,
      responseOptions: {
        includeHeaders: true,
        includeBody: true,
      },
    });
    ```
  - Response headers included via `responseOptions.includeHeaders` are redacted by header name. This covers common sensitive header names such as authorization, token, secret, password, cookie, and key, but it is a best-effort heuristic.

- 105840b: Removing support for non-wrapped activity results and legacy child workflow executions (pre v0.8.0). Workflow executions from those versions can no longer be replayed.

### Patch Changes

- 62d9754: Add support to Temporal worker tuner options. This can be set using a new environment variable `TEMPORAL_WORKER_TUNER` that accepts a JSON value.

## 0.9.2

### Patch Changes

- 9d7a870: Pinning v24.15.0 as the minimal supported Node version
- 52c7f0a: Improving catalog startup performance by storing and reading hash from memo. Storing workflow names in memo.

## 0.9.1

### Patch Changes

- 0964a83: - Disabled HTTP/2 (`allowH2: false`) in the global fetch dispatcher configured by `setGlobalDispatcher` when proxy env vars are detected;
  - Disabled HTTP/2 (`allowH2: false`) in the webhook functions `sendHttpRequest` and `sendPostRequestAndAwaitWebhook` by using a dispatcher (`EnvHttpProxyAgent`).

## 0.9.0

### Patch Changes

- ec4c07d: Added activity lifecycle hooks: `onActivityStart`, `onActivityEnd`, `onActivityError`.

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

- 4b5c049: Updating libraries to fix vulnerabilities
- ad732b1: Added a new `Logger` export for structured logging from both workflows and steps. Logs use the same `message` plus `metadata` shape as the internal worker logger and are routed through the worker's Winston logger.

  All log messages are enriched with execution metadata:

  - Workflow logs include `workflowType`, `workflowId`, and `runId`.
  - Step logs include the same workflow fields, plus `activityType` and `activityId`.

  ```ts
  import { Logger } from "@outputai/core";

  Logger.info("I am a log", { extraInfo: "none" }); // workflows inside workflow and steps
  ```

  Supported levels are:

  - error
  - warn
  - info
  - http
  - verbose
  - debug
  - silly

  The default displayed level is debug in development and info in production. Override it with `OUTPUT_LOG_LEVEL` env var. This setting also affects internal worker logs.

- 42a0ddf: Including /dist when calculating catalog hash to define if catalog workflow needs restart. Excluding /temp.

## 0.8.1

### Patch Changes

- aa8ed5e: - Updating connection monitor strategy to ping workflowService instead of healthService.
  - Adding new env vars to configure Temporal worker shutdownForceTime and shutdownGraceTime:
    - TEMPORAL_SHUTDOWN_FORCE_TIME
    - TEMPORAL_SHUTDOWN_GRACE_TIME

## 0.8.0

### Minor Changes

- 5485680: - Removed workflow-level usage aggregation from `@outputai/core`; workflows no longer collect activity attributes into final `aggregations` totals or expose those totals in workflow run results.
  - Reworked workflow-to-workflow invocation so direct workflow calls made from workflow code now consistently execute as Temporal child workflows, including calls made through helper functions outside the parent workflow handler.
  - Removed workflow call rewriting from the workflow webpack loader while preserving activity, step, and evaluator call rewriting.
  - Renamed workflow invocation configuration types from `WorkflowInvocationConfiguration` to `WorkflowInvocationOptions`.
  - Updated workflow invocation options so activity overrides are passed as top-level `activityOptions` instead of the previous `options` property.
  - Refactored workflow validation internals around centralized schemas and explicit validator classes for workflows, steps, and evaluators.
  - Hardened Zod schema detection for multi-package or multi-realm Zod v4 environments.

### Patch Changes

- 5485680: improve worker startup time by only calculating workflow sources
- 0e958f3: Added Temporal connection monitoring. When connection is lost, graceful shuts down the worker.
- 5485680: Fixed missing eventDate fields on hook types.
- 5485680: Add an opt-in `output-worker --check` workflow bundle check that reproduces the worker's webpack bundling without a Temporal server, catching bad workflow imports — e.g. a transitive `node:` built-in — before they crash-loop the worker at startup. `tsc` cannot detect these; only the Temporal bundle can.

  - `output-worker --check` bundles workflows via the same `bundleWorkflowCode` path `Worker.create` uses, exits non-zero with the offending module named, and needs no Temporal connection or worker env.
  - Scaffolded projects gain an opt-in `output:worker:check` script plus README/CI guidance (not wired into any build).

## 0.7.0

### Minor Changes

- 383b24b: ## Workflow hooks
  Updated `onWorkflowStart()`, `onWorkflowEnd()`, `onWorkflowError()` hooks payload:

  ```js
  { eventId, eventDate, workflowDetails, error? }
  ```

  Where `eventDate` is the event timestamp in milliseconds.

  Where `workflowDetails` is an abstraction over [Temporal's `workflowInfo()`](https://typescript.temporal.io/api/interfaces/workflow.WorkflowInfo):

  ```ts
  {
    attempt: number,
    continuedFromExecutionRunId?: string | undefined,
    firstExecutionRunId: string,
    parent?: {
      runId: string,
      workflowId: string,
      namespace: string
    } | undefined,
    root?: {
      runId: string,
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
  {
    eventId, eventDate, source, workflowDetails, error;
  }
  ```

  Where `workflowDetails` is the same as in workflow hooks.

  ### Source is "activity"

  ```js
  {
    eventId,
      eventDate,
      source,
      workflowDetails,
      activityInfo,
      outputActivityKind,
      error;
  }
  ```

  Where `activityInfo` is Temporal's `activityInfo()` [function return](https://typescript.temporal.io/api/interfaces/activity.Info).

  And `outputActivityKind` is the framework flavor of the Temporal Activity: `step`, `evaluator` or `internal_step`.

  ### Source is "runtime"

  ```js
  {
    eventId, eventDate, source, error;
  }
  ```

  ## "on()" hook

  Updated `on()` hooks with better typing and a new envelope.

  ### Envelope

  All events have these fields:

  - `eventId`
  - `eventDate`
  - `workflowDetails`: Same from other hooks
  - `activityInfo`: From Temporal
  - `outputActivityKind`

  ### Typing

  Besides the envelope fields, each event also has its own fields, their types are specified by the event emitter:

  - `on<HttpRequestEvent>( 'http:request', handler )` from `@outputai/http`;
  - `on<HttpRequestCostEvent>( 'cost:http:request', handler )` from `@outputai/http`;
  - `on<LLMUsageEvent>( 'cost:llm:request', handler )` from `@outputai/llm`

  ## Execution Context

  Updated `getExecutionContext()` from `core/sdk_activity_integration` to return:

  ```js
  {
    activityInfo, workflowFilename;
  }
  ```

  ## Trace File

  Updated trace workflow node ids to use Temporal `runId`, instead of `workflowId`. This helps to create trees when child workflows "continued as new".

### Patch Changes

- 1f47248: Added worker telemetry logs: print Temporal worker status and node memory every X ms, configured by `OUTPUT_WORKER_TELEMETRY_INTERVAL_MS` env var. Default `0` - off.

  Message examples:

  ### Dev

  ```
  [info] Telemetry: Worker { status: { runState: "RUNNING", numHeartbeatingActivities: 0, workflowPollerState: "POLLING", activityPollerState: "POLLING", hasOutstandingWorkflowPoll: true, hasOutstandingActivityPoll: true, numCachedWorkflows: 1, numInFlightWorkflowActivations: 0, numInFlightActivities: 0, numInFlightNonLocalActivities: 0, numInFlightLocalActivities: 0 }, memory: { availableMemory: 7500000000, constrainedMemory: 20000000000000000000, memoryUsage: { rss: 582348800, heapTotal: 400000000, heapUsed: 200000000, external: 800000000, arrayBuffers: 300000000 } } }
  ```

  ### Prod

  ```json
  {
    "environment": "production",
    "level": "info",
    "memory": {
      "availableMemory": 7500000000,
      "constrainedMemory": 20000000000000000000,
      "memoryUsage": {
        "arrayBuffers": 1445268,
        "external": 800000000,
        "heapTotal": 400000000,
        "heapUsed": 200000000,
        "rss": 300000000
      }
    },
    "message": "Worker",
    "namespace": "Telemetry",
    "service": "output-worker",
    "status": {
      "activityPollerState": "POLLING",
      "hasOutstandingActivityPoll": true,
      "hasOutstandingWorkflowPoll": true,
      "numCachedWorkflows": 1,
      "numHeartbeatingActivities": 0,
      "numInFlightActivities": 0,
      "numInFlightLocalActivities": 0,
      "numInFlightNonLocalActivities": 0,
      "numInFlightWorkflowActivations": 0,
      "runState": "RUNNING",
      "workflowPollerState": "POLLING"
    },
    "timestamp": "2026-06-02T21:54:29.261+00:00"
  }
  ```

- 0d08ff5: Improve trace error serialization to preserve nested error causes. Error entries in trace files now include the error `name`, `message`, `stack`, and recursively serialized `cause` values up to 10 levels deep, including JSON-safe non-Error causes where present.

  ```js
  {
    name: "from error.constructor.name",
    message: "from error.message",
    stack: "from error.stack",
    cause: { // from .cause
      name: "from error.constructor.name",
      message: "from error.message",
      stack: "from error.stack",
      cause: {
        ... // up to 10 levels
      }
    }
  }
  ```

## 0.6.0

### Minor Changes

- 69060d7: - Removed property `.attributes` from workflow result wrapper object: Workflows will no longer accumulate or expose attributes;
  - Added `__output_workflow_wrapper_version=1` field on workflow wrapper object to better version it;
  - Removed Signals-based communication between Activities and Workflows to share individual attributes:
    - Each activity now aggregates all attributes of the events that happened within it. This is returned in a new wrapper around the activity:
    ```js
    {
      __output_activity_wrapper_version: 1, // internal flag to indicate this wrapper's version
      output: ..., // the raw output from the activity
      aggregations: {  // aggregation object with total llm/http usage and cost from all requests of this activity
        cost: {
          total: 1 // total cost from all http and llm requests
        },
        tokens: { // breakdown of all llm tokens used
          total: 10,
          input: 3,
          cached_input: 1,
          output: 4,
          reasoning: 2
        },
        httpRequests: { // total number of http calls made
          total: 3
        }
      }
    }
    ```
    - Workflows now read these aggregations and merge them to create the final `.aggregations` object returned in its result, which is unchanged;
    - When Activities fail, a fallback Signal is sent with the aggregations so workflows can still compute them, avoiding data loss.

### Patch Changes

- bdf47aa: Rewriting the catalog workflow startup logic to better handle multiple instances of the worker and avoiding restarting the workflow unnecessarily.

## 0.5.2

### Patch Changes

- 17d8711: Every payload emitted through the framework's `messageBus` now carries a UUID v4 `eventId` — stamped at the bus layer, so events emitted via `emitEvent` _and_ lifecycle hook payloads (`onWorkflowStart`, `onWorkflowEnd`, `onWorkflowError`, `onError`) both receive it. Consumers can rely on `eventId` as a stable per-emit idempotency key — e.g., for webhook retry handling, ClickHouse `ReplacingMergeTree` dedup, audit logs. The previously emitted `requestId` is not safe for this purpose because `cost:http:request` and `http:request` for the same fetch share a `requestId`.

  Callers may pre-set `eventId` on the payload to override the generated one (intended for deterministic retry scenarios). Additive — existing consumers ignoring the field continue to work.

- cc8a372: Attribute signal emission is now opt-in via `OUTPUT_ENABLE_ATTRIBUTE_SIGNAL_EMISSION=true`. Each LLM call and HTTP request previously fired a Temporal signal back to the workflow, bloating workflow history on runs with many calls. With emission off (the new default), workflow results still expose `attributes` and `aggregations` keys but they are empty/zeroed, and the `cost:llm:request` / `cost:http:request` hooks do not fire. Set the env var on the worker process to opt back in.

  The CLI's dev docker-compose forwards the flag from the host shell, so `OUTPUT_ENABLE_ATTRIBUTE_SIGNAL_EMISSION=true output dev` opts in without editing compose.

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
