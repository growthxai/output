# @outputai/cli

## 0.13.0

### Minor Changes

- 69255d7: Added support for pricing Gemini grounded search, which providers bill per request rather than per token. `LLMGenerationUsage` and `LLMGenerationCost` items gain a `request` group alongside `input` and `output`. The legacy `cost:llm:request` payload is unchanged and does not carry grounding charges — its shape is frozen, so grounding costs are only visible on the new normalized attribute.

  `output workflow cost` prices these request-based charges and marks any call with an unpriced charge (grounding or otherwise) with a `*` and a "cost incomplete" footnote, since the reported total understates the actual bill.

### Patch Changes

- Updated dependencies [69255d7]
  - @outputai/llm@0.13.0
  - @outputai/credentials@0.13.0
  - @outputai/evals@0.13.0

## 0.12.0

### Minor Changes

- da26845: Updated `output workflow cost` to read the normalized `llm:generation:cost` and `llm:generation:usage` trace attributes while retaining support for legacy `llm:usage` traces. Cost overrides now reprice cache-read, cache-write, text, and reasoning usage, and model prefix matching selects the most specific configured price.

### Patch Changes

- Updated dependencies [da26845]
- Updated dependencies [a5ded18]
- Updated dependencies [b3beef1]
- Updated dependencies [b3beef1]
- Updated dependencies [90d8cc0]
- Updated dependencies [90d8cc0]
  - @outputai/llm@0.12.0
  - @outputai/evals@0.12.0
  - @outputai/credentials@0.12.0

## 0.11.0

### Minor Changes

- 46d9d66: - Added support for legacy and V2 workflow results from the API, including structured errors;
- 64a9df7: Add workflow monitor command, update workflow history API to be resumable
- 74e6a3d: ## `workflow start --monitor`

  Added a `--monitor` (`-m`) flag to `output workflow start` that attaches and streams step updates as soon as the workflow is started, so you no longer have to copy the workflow ID into a separate `workflow monitor` call.

  ```bash
  output workflow start lead_enrichment --input ./test_input.json --monitor
  ```

  - Monitoring is pinned to the run id returned by `start`, so a rapid re-start can't leave you watching a different execution.
  - Behavior matches `workflow monitor`: Ctrl+C detaches without stopping the workflow (exit `130`), and a failed workflow exits `1`.
  - If the stream itself drops after the workflow was started, the command reports that the workflow is still running and exits `3` — distinct from `1`, so retry logic keyed on a failed workflow can't re-submit one that is already in flight.
  - `--interval`, `--include-payloads`, and `--color` tune the stream and require `--monitor`.
  - `--monitor` cannot be combined with `--json`, which suppresses progress output and prints a single object at the end — that would swallow the whole stream. Use `workflow run --json` to wait for a result, or `workflow monitor --format json` for streaming NDJSON.

  The polling loop moved to a shared module so `workflow monitor` and `workflow start --monitor` run the same code path. Two fixes fall out of that for `workflow monitor` as well: a transient failure on the _first_ poll is now retried like any other (it used to abort immediately), and Ctrl+C waits for output to flush before exiting, so a piped session can't lose its last lines. Detaching now also names `workflow status`/`workflow result` for the run you left behind.

- c717e35: Renamed the workflow eval CLI command to `output workflow test` (was `output workflow test_eval`). The short `test` name is now the only command id; the `test_eval` name is removed.
- 2cbd0a2: Add TUI attaching and re-attaching and `dev down` teardown command

  `output dev` now detects an existing stack with `docker compose ps` instead of an
  unconditional host-port probe, so a re-run attaches to a running project stack
  rather than aborting on a collision with its own containers. Attached sessions
  leave the stack up on quit; `output dev down` stops it.

  A stack whose containers are all stopped counts as a fresh start, not an attach —
  `output dev` restarts it in the foreground and still tears it down on quit.

  `output dev -d` gained the pre-flight port probe the foreground path has. This
  matters on Docker Desktop, where a non-container process holding a published port
  does not fail `compose up -d`: the container starts and the port keeps answering
  the other process, with no error from Docker.

  Note: `-d` now pipes Docker's output rather than inheriting the terminal, so
  Docker drops its redrawing progress bars for plain scrolling lines.

### Patch Changes

- 14a191e: CLI env loading now uses Node's `process.loadEnvFile` instead of the `dotenv` package.
- 52bedcf: Restore the terminal on abnormal `output dev` exit. Uncaught exceptions and unhandled rejections now leave the alternate-screen buffer and unmount the TUI before exiting, so scrollback and the error stack stay readable.
- 6ce5320: Fix `--json` output on the `workflow start` and `workflow run` commands. `workflow start` did not support `--json` at all and errored on the flag; it now emits the workflow result as JSON. `workflow run --json` corrupted its JSON output when given a scenario argument, because the "Using scenario:" notice was written to stdout. That notice now goes to stderr, and is suppressed entirely under `--json` so that on success both commands write exactly one JSON object to stdout and nothing else.
- bf95a6f: Updated `js-yaml` from `4.3.0` to `4.3.1`
- 3c76007: - Removed install from hot-reload when developing workflows (`output dev`): nodemon no longer runs `npm install` on every reload, and `package.json` is no longer watched. After dependency changes, run `npm install`, bring the stack down (`output dev down` if it is still running), and start `output dev` again.
  - `npm run output:worker` also no longer installs first — run `npm run output:worker:install` (or rely on `output dev`, which still installs on worker start) before build/start. `npx output fix` rewrites `output:worker` in existing projects when you apply it.
- f6a7c1a: fix `output dev` memory leak in TUI where workflow run details grew unbounded
- Updated dependencies [09ed166]
- Updated dependencies [2caa4a1]
- Updated dependencies [46d9d66]
- Updated dependencies [bf95a6f]
- Updated dependencies [82e6b25]
  - @outputai/llm@0.11.0
  - @outputai/credentials@0.11.0
  - @outputai/evals@0.11.0

## 0.10.0

### Minor Changes

- 14a0cfc: Add API endpoint and CLI command to get input from a workflow run
- c318502: The JSON output for workflow result commands no longer includes unavailable trace destinations as `null`.
  This affects:

  - `output workflow run ... --json`
  - `output workflow result <workflow-id> --json`

  _Before:_

  ```json
  {
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
    "trace": {
      "destinations": {}
    }
  }
  ```

### Patch Changes

- Updated dependencies [67c8141]
  - @outputai/llm@0.10.0
  - @outputai/credentials@0.10.0
  - @outputai/evals@0.10.0

## 0.9.2

### Patch Changes

- 9d7a870: Pinning v24.15.0 as the minimal supported Node version
- Updated dependencies [9d7a870]
  - @outputai/credentials@0.9.2
  - @outputai/evals@0.9.2
  - @outputai/llm@0.9.2

## 0.9.1

### Patch Changes

- 2091eae: Add `output workflow history <workflowId>` — renders a run's step timeline as a terminal waterfall (each step's start offset and duration), mirroring the Agents HQ Timeline view. It pages the `GET /workflow/{id}/history` endpoint and correlates the Temporal events into per-step spans (numbering parallel fan-outs `#1..#N`). `--format json` emits the structured spans, `--raw` prints the endpoint's verbatim response, and `--run-id`, `--include-payloads`, `--width`, and `--no-color` are supported. Failed steps list their error reason beneath the chart (when payloads are included), and `FORCE_COLOR` forces ANSI output through a pipe.

  The same waterfall is available in the `output dev` TUI: from the Recent Runs tab, press `g` on any run to open its step graph as a full-width overlay. The overlay shows the run's status, start time, and duration, and live-updates while the run is in progress (the time axis tracks elapsed wall-clock and running bars grow). Select a step with `↑/↓` to inspect its input, output, and timing (start/end/duration) in the detail pane; `←/→` switches tabs and `e` expands a field full-screen.

- Updated dependencies [0964a83]
  - @outputai/llm@0.9.1
  - @outputai/credentials@0.9.1
  - @outputai/evals@0.9.1

## 0.9.0

### Minor Changes

- c12766f: Replace the custom `--format json` option with oclif's built-in `--json` flag across all workflow commands (OUT-419).

  `--json` suppresses informational logs (e.g. `Fetching result for workflow...`) and emits clean, machine-readable JSON to stdout, fixing output that previously mixed status text into JSON.

  **Breaking change:** `--format json` is no longer accepted. Use `--json` instead.

  - `workflow result`, `workflow status`, `workflow run`, `workflow cost`, `workflow debug`, `workflow test`: the `--format` flag is removed; pass `--json` for JSON output (text remains the default).
  - `workflow list`, `workflow runs list`, `workflow dataset list`: `--format` keeps its non-JSON options (`list`/`table`/`text`); use `--json` for JSON output.

  The "update available" banner no longer prints to stdout: it now goes to stderr (keeping stdout clean for piping in every mode) and is suppressed entirely under `--json`.

- 7929835: CLI `start`/`run`/`test`/`dataset generate` now resolve scenarios and route execution against `--catalog`/`OUTPUT_CATALOG_ID` instead of the API server's default catalog. This removes the ~30s scenario-resolution stall in worktrees where the default catalog has no worker polling it. `workflow test` and `workflow dataset generate` also gain a `--catalog` flag (env: `OUTPUT_CATALOG_ID`), matching `list`/`start`/`run`.
- aaa08cc: Add new endpoint for workflow history with server side events

### Patch Changes

- 4b5c049: Updating libraries to fix vulnerabilities
- e658cc2: Add an "Enter input" option to the `output dev` run pane. Edit a payload and press ctrl+r to run it as-is without saving, or ctrl+s to save it as a scenario first. Previously every ad-hoc run forced you to name and save a scenario file.
- Updated dependencies [4b5c049]
  - @outputai/llm@0.9.0
  - @outputai/credentials@0.9.0
  - @outputai/evals@0.9.0

## 0.8.1

### Patch Changes

- c2347a6: Resolve datasets and evals for nested workflow folders by the workflow's registered name (via the worker catalog), keeping the flat-path lookup as an offline fast path. `output workflow test`, `dataset generate`, and `dataset list` now work for workflows in nested directories (e.g. `src/workflows/a/b/c` registered as `a_b_c`) without a symlink. `output workflow test` also fails fast with an actionable message when a `<wf>_eval` workflow's source exists but didn't compile to `dist`.
  - @outputai/credentials@0.8.1
  - @outputai/evals@0.8.1
  - @outputai/llm@0.8.1

## 0.8.0

### Minor Changes

- 5485680: - Updated workflow result API responses to return workflow output and trace metadata without workflow-level `aggregations`.
  - Regenerated CLI API types to match the workflow result response shape.

### Patch Changes

- 5485680: Faster CLI startup: ship `oclif.manifest.json` in the published package so only the invoked command module is loaded (instead of importing every command on every invocation), move the update check off the critical path (the init hook now only reads the local cache and refreshes it via a detached background process with a 5s registry timeout, instead of awaiting an unbounded `npm view` subprocess), and load `undici` only when a proxy env var is configured.
- 5485680: `workflow cost` now calculates costs from the trace events themselves (the as-charged "Original" cost) and applies `costs.yml` as an override layer (the "Adjusted" cost), displaying both per model and per host. This fixes models with no `costs.yml` entry (e.g. `gpt-5.5`) and HTTP hosts (e.g. `api.exa.ai`, `api.firecrawl.dev`) previously reporting $0, and surfaces where the configured `costs.yml` rate diverges from what was actually charged. The bottom line shows the adjusted total with the as-charged total alongside.

  Costs come exclusively from trace cost attributes: LLM nodes with an `llm:usage` event and HTTP calls with an `http:request:cost` event are counted as-charged (even on error responses — the event proves a charge); calls without events are not priced. Traces from SDK versions that predate cost attributes (< 0.5) report no costs. Only exact (`computed`) recomputes override an event cost — estimates and failed recomputes never do, and a configured `$0` price is now honored. Body-dependent `costs.yml` service rules require traces recorded with `OUTPUT_TRACE_HTTP_VERBOSE=true` (the dev default).

  **`--format json` field changes** (the report shape changed; update any scripts parsing it): `llmTotalCost` → `llmOriginalCost`/`llmAdjustedCost`; `services[]`/`serviceTotalCost` → `httpCosts[]` (grouped by `host`) with `httpOriginalCost`/`httpAdjustedCost`; `unknownModels` removed; per-call `cost`/`warning` → `originalCost`/`adjustedCost`; new `originalTotalCost`; `totalCost` is now the adjusted total.

- 5485680: Surface workflow aliases and honor `OUTPUT_CATALOG_ID` in `output workflow list`.

  - The default list output now appends `(aliases: ...)` to workflows that have registered aliases, which previously only appeared in `--format table`/`--format json` (OUT-444).
  - Add a `--catalog` flag (env `OUTPUT_CATALOG_ID`) that resolves workflows from a specific catalog, falling back to the server-default catalog — matching the existing behavior of `run` and `start` (OUT-489).

- Updated dependencies [5485680]
- Updated dependencies [5485680]
  - @outputai/llm@0.8.0
  - @outputai/credentials@0.8.0
  - @outputai/evals@0.8.0

## 0.7.0

### Patch Changes

- 83742db: `credentials set` and `credentials edit` now check whether the current key can decrypt the existing credentials file before re-encrypting. On a key mismatch they abort with a clear warning that the wrong key may be in use and the file would be re-encrypted under a different key. Pass `--force` / `-f` to proceed anyway (re-encrypts from empty, discarding the undecryptable values).
- Updated dependencies [5d7e612]
- Updated dependencies [2cc4685]
- Updated dependencies [34badf9]
- Updated dependencies [383b24b]
- Updated dependencies [fc6a93e]
- Updated dependencies [f8d698e]
  - @outputai/llm@0.7.0
  - @outputai/credentials@0.7.0
  - @outputai/evals@0.7.0

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
