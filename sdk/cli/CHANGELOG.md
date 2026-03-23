# @outputai/cli

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
