# @outputai/cli

## 0.6.0

### Patch Changes

- 69060d7: Removed "Attributes" tab from Recent Runs > [Workflow view].
  - @outputai/credentials@0.6.0
  - @outputai/evals@0.6.0
  - @outputai/llm@0.6.0

## 0.5.2

### Patch Changes

- 8738f60: Bump default local Temporal namespace retention from 24h to 720h (30 days) so workflow runs aren't garbage-collected within a day during local development.
- 93dd22e: Support multiple `npx output dev` stacks side-by-side:

  - Expose `OUTPUT_TEMPORAL_HOST_PORT` (default 7233) so dev Temporal can be relocated off 7233.
  - Document the multi-stack recipe (`DOCKER_SERVICE_NAME`, `OUTPUT_CATALOG_ID`, and the three `OUTPUT_*_HOST_PORT` knobs) in `cli.mdx`.
  - Surface an actionable hint when docker compose fails to bind a host port, naming the conflicting port and the env var that overrides it.

- cc8a372: Attribute signal emission is now opt-in via `OUTPUT_ENABLE_ATTRIBUTE_SIGNAL_EMISSION=true`. Each LLM call and HTTP request previously fired a Temporal signal back to the workflow, bloating workflow history on runs with many calls. With emission off (the new default), workflow results still expose `attributes` and `aggregations` keys but they are empty/zeroed, and the `cost:llm:request` / `cost:http:request` hooks do not fire. Set the env var on the worker process to opt back in.

  The CLI's dev docker-compose forwards the flag from the host shell, so `OUTPUT_ENABLE_ATTRIBUTE_SIGNAL_EMISSION=true output dev` opts in without editing compose.

  - @outputai/credentials@0.5.2
  - @outputai/evals@0.5.2
  - @outputai/llm@0.5.2

## 0.5.1

### Patch Changes

- @outputai/credentials@0.5.1
- @outputai/evals@0.5.1
- @outputai/llm@0.5.1

## 0.5.0

### Patch Changes

- d085dde: Improved the dev TUI experience with clearer workflow run views, expanded full-screen modals, and more consistent layout and interaction patterns across screens.

  Workflow run details now show result attributes and aggregations alongside input/output data.

  For scaffolded projects running `output dev`, the local Docker Compose API service now uses the documented `OUTPUT_AWS_*` variables for remote S3 trace access. If you use remote trace storage locally, set `OUTPUT_AWS_REGION`, `OUTPUT_AWS_ACCESS_KEY_ID`, and `OUTPUT_AWS_SECRET_ACCESS_KEY` in your project environment; the accidental `AWS_*` passthrough is no longer used.

- Updated dependencies [43c9293]
- Updated dependencies [6bc541c]
  - @outputai/llm@0.5.0
  - @outputai/credentials@0.5.0
  - @outputai/evals@0.5.0

## 0.4.0

### Patch Changes

- 6137ea6: Fixed `output credentials edit` modifying the encrypted credentials file on disk even when the user made no changes in their editor. Because AES-GCM uses a fresh nonce per encryption, the unconditional re-write produced new ciphertext bytes and left the file dirty in git on every invocation. The command now skips the write when the post-editor plaintext is identical to the original.
- e8eff63: Fixed `output dev` hanging until the health timeout when `docker compose up` exited before creating containers. The CLI now drains and captures recent Compose output, reports early Compose exits immediately, polls status with the same project directory used to start the stack, and only treats running containers as healthy.
- 32f4d87: - Bumped scaffold prompt template default from `claude-haiku-4-5` to `claude-sonnet-4-6` and added a dated `current as of` comment pointing at the new `output-dev-model-selection` skill (workflow scaffold, blog_evaluator example, workflow README example).
  - No CLI behavior change beyond the new default model in generated `.prompt` files.
- 2650161: Fix scenario loading in `output dev` for workflows whose name differs from their local folder path. For example, a workflow named `writing_editor` stored in `src/workflows/writing/editor` now shows and runs its scenarios correctly.
- Updated dependencies [b23002f]
  - @outputai/llm@0.4.0
  - @outputai/credentials@0.4.0
  - @outputai/evals@0.4.0

## 0.3.2

### Patch Changes

- 1282dcf: Rebuild `output dev` as a full-featured INK TUI. Tabbed UI for Workflows, Recent Runs, Services, and Help with arrow-key navigation, an in-TUI scenario picker and JSON editor for running workflows, an expanded JSON modal for input/output, and a live `docker compose logs` tail with restart hotkeys.
  - @outputai/credentials@0.3.2
  - @outputai/evals@0.3.2
  - @outputai/llm@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [00e0047]
  - @outputai/llm@0.3.1
  - @outputai/credentials@0.3.1
  - @outputai/evals@0.3.1

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

- 2ddcc3e: Improve encrypted credentials loading: add clearer errors when keys are missing or invalid and ensure the CLI exits gracefully instead of printing stack traces.
- 6cd5716: - Offer to initialize a git repository when running `output init`. Adds a `--skip-git` flag to opt out in non-interactive / scripted use.
  - Fix `--yes` / `--non-interactive` being rejected as "Nonexistent flag" by oclif's per-command parser when passed to any command.
- 7fd86e7: Add non-interactive mode with `--yes`/`--non-interactive` flags and TTY auto-detection for sandbox environments
- 7e1c76d: Fix the workflow runs pane in the CLI so the detail view reflects the highlighted run instead of always showing the latest run. `GET /workflow/runs` now includes `runId` per row, and the CLI fetches results via the pinned `GET /workflow/{id}/runs/{rid}/result` endpoint.
- 52e960c: Enable multiple instance of Output to run locally simultaneously in Docker by enabling dynamic port mapping
- 0cbee89: Add HTTP and gRPC proxy support for sandbox environments via HTTPS_PROXY and TEMPORAL_GRPC_PROXY env vars
- 6499038: Shadow the worker container's `/app/node_modules` (root pnpm store) with a named Docker volume and run an explicit `output:worker:install` before `output:worker:watch`, so Linux-native packages installed in the container no longer leak into the host's `node_modules/`.
- bd54540: Fix issue where values in .env files were silently ignored
- Updated dependencies [b87b58f]
- Updated dependencies [bc8ccee]
- Updated dependencies [05462f4]
- Updated dependencies [2ddcc3e]
- Updated dependencies [899ddaf]
- Updated dependencies [23c3ed0]
- Updated dependencies [815b3a9]
  - @outputai/llm@0.3.0
  - @outputai/credentials@0.3.0
  - @outputai/evals@0.3.0

## 0.2.0

### Minor Changes

- 0fd573d: Add `output migrate` command for upgrading projects between versions of the Output framework.

  The command reads the project's current `@outputai/*` version, fetches the matching migration guide from `docs.output.ai/migrations`, applies the steps, bumps dependencies, and runs the project's type checker. If the user is jumping multiple boundaries, it chains the guides covering the full range.

  Under the hood the CLI invokes `/output-migrate` — a Claude Code skill shipped via the `outputai` plugin marketplace. The skill carries the migration logic but no version-specific content; it fetches every guide at runtime so the docs remain the source of truth.

- 04243eb: Update the Claude plugin for Output to improve workflow code generation"

### Patch Changes

- 91c5d78: Fix `workflow generate` success message to show actual workflow ID and scenario name
- 455ac5e: Add `credentials set` command for programmatic credential updates by dot-notation path. Prompts for confirmation when the write would change a value's shape (primitive → object or object → primitive); pass `--yes` to skip in non-interactive environments.
- b651368: Add interactive workflow run panel to `output dev` with live status polling, keyboard navigation, and Temporal UI integration
- cc1ead7: Update plugin command invocations to match renamed `output-plan-workflow`, `output-build-workflow`, and `output-debug-workflow` skills.
- b3dea5c: Add Docker Compose version check to prevent silent hangs on versions older than v2.24.0
- 320acd1: Upgrading Docker Node image version from 24.13.0-slim to 24.15.0-slim
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

- 0bb44fb: Auto-forward OUTPUT_CATALOG_ID as default task queue for workflow run/start commands
- ac8c0f7: Bumping dependency versions
- Updated dependencies [4407119]
- Updated dependencies [f13723b]
- Updated dependencies [ac8c0f7]
  - @outputai/evals@0.2.0
  - @outputai/credentials@0.2.0
  - @outputai/llm@0.2.0

## 0.1.12

### Patch Changes

- 5ef9a7c: update package.json template to pin output to specific version, and not a range
- 0990e42: ## Commands
  Updated NPM scripts in autogenerated `package.json` from @outputai/cli scaffold. Also aligned internal dev scripts.

  ### Added commands:

  - `output:worker`: Executes install/build/start;
  - `output:worker:watch`: Executes `output:worker` using nodemon to watch for changes (hot reload).

  ### Replaced commands:

  - `dev` -> `output:dev`: Same pattern as other commands.

  ## CLI Feature

  Added new CLI feature "fix" (invoked via `output fix`), which realigns NPM scripts in the host project's `package.json` with the canonical scripts from `@outputai/cli`:

  - Removes legacy scripts (from previous versions of Output);
  - Adds missing scripts (based on the CLI internal template);
  - Replaces reserved scripts the user has customized (`output:` prefix).

  ## Pinned dependency versions

  Using pinned versions of the dependencies installed via the CLI-generated `package.json`.

- e3a6d72: Update CLI cost configuration for calculating cost of Claude Sonnet 4.6

  Update Coding Assistant guidance to improve schema generation

- Updated dependencies [76bcede]
  - @outputai/llm@0.1.12
  - @outputai/credentials@0.1.12
  - @outputai/evals@0.1.12

## 0.1.11

### Patch Changes

- 49171f5: Fix worker health checks and add yarn/pnpm support in dev container

  - Support yarn and pnpm projects via corepack in the dev container worker (OUT-330)
  - Fix health check incorrectly reporting success when containers exit or are unhealthy (OUT-334)
  - Fix false failure warnings during startup when services are in `starting` state
  - Reduce worker health check detection time from ~36s to ~9s (timeout 10s→3s, retries 20→2)
  - Extend worker health check start_period from 30s to 60s to reduce false positives on cold start

- 7b8340c: Fix plan and generate CLI commands

  - Suppress Claude file writes and next-step suggestions during plan generation (the CLI owns those responsibilities)
  - Validate plan file existence before creating workflow skeleton in generate command
  - Roll back created skeleton files if workflow build step fails
  - Fix empty workflow name in "already exists" error message

- e0a5d0f: Replaced log-update/ANSI output in `output dev` with an Ink-based terminal UI, fixing a layout bug where text overlapped after a Docker service recovered from unhealthy. The dev panel now re-renders correctly on all state transitions.
- c4f84d5: ensure credential references are resolved when running CLI commands
  - @outputai/credentials@0.1.11
  - @outputai/evals@0.1.11
  - @outputai/llm@0.1.11

## 0.1.10

### Patch Changes

- 41ecc1b: Updating dependencies to latest and overriding version to fix vulnerabilities
- Updated dependencies [41ecc1b]
  - @outputai/llm@0.1.10
  - @outputai/credentials@0.1.10
  - @outputai/evals@0.1.10

## 0.1.9

### Patch Changes

- 133551f: Fix best practices in the output init example: move blogContentSchema from steps.ts to types.ts, and update README template to use npx output credentials flow instead of .env
  - @outputai/credentials@0.1.9
  - @outputai/evals@0.1.9
  - @outputai/llm@0.1.9

## 0.1.8

### Patch Changes

- 834d0aa: Use encrypted credentials in `output init` scaffold by default. API keys are now stored in `config/credentials.yml.enc` instead of `.env`, and `<SECRET>` markers are renamed to `<FILL_ME_OUT>`.
- Updated dependencies [f78154c]
  - @outputai/llm@0.1.8
  - @outputai/credentials@0.1.8
  - @outputai/evals@0.1.8

## 0.1.7

### Patch Changes

- ac7fc2b: Bumping dependecies minor, patch versions
- Updated dependencies [ac7fc2b]
  - @outputai/llm@0.1.7
  - @outputai/credentials@0.1.7
  - @outputai/evals@0.1.7

## 0.1.6

### Patch Changes

- 2dba5c6: Fix null crash in `workflow cost` when pricing config is empty or missing
  - @outputai/credentials@0.1.6
  - @outputai/evals@0.1.6
  - @outputai/llm@0.1.6

## 0.1.5

### Patch Changes

- a03318d: Fix prod publish to include build step before publishing to npm. Previously, packages were published without compiling TypeScript, resulting in missing `dist/` directory. Add `@next` dist-tag that auto-publishes from every merge to main, enabling `npx @outputai/cli@next` for tracking the latest changes.
  - @outputai/credentials@0.1.5
  - @outputai/evals@0.1.5
  - @outputai/llm@0.1.5

## 0.1.4

### Patch Changes

- b9b986d: Patching vulnerable dependencies
- Updated dependencies [b9b986d]
  - @outputai/credentials@0.1.4
  - @outputai/evals@0.1.4
  - @outputai/llm@0.1.4

## 0.1.3

### Patch Changes

- 2547029: Add `credential:` env var convention for automatic secret resolution at worker startup.

  `core`: add `WORKER_BEFORE_START` lifecycle event and `onBeforeStart` hook.

  `credentials`: add `resolveCredentialRefs()` that resolves `credential:<dot.path>` env vars from encrypted credentials, auto-registered via `onBeforeStart` on import.

  `cli`: scaffold build script now copies `*.key` files to `dist/` alongside `*.yml.enc`.

- Updated dependencies [2547029]
  - @outputai/credentials@0.1.3
  - @outputai/evals@0.1.3
  - @outputai/llm@0.1.3

## 0.1.2

### Patch Changes

- 5f1d559: Updating @anthropic-ai/claude-agent-sdk from 0.1.71 to 0.2.77.
  - @outputai/credentials@0.1.2
  - @outputai/evals@0.1.2
  - @outputai/llm@0.1.2

## 0.1.1

### Patch Changes

- ec4c478: Updating dependencies with minor and patch updates.
  - @outputai/credentials@0.1.1
  - @outputai/evals@0.1.1
  - @outputai/llm@0.1.1
