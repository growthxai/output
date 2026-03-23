# @outputai/credentials

## 0.1.5

### Patch Changes

- @outputai/core@0.1.5

## 0.1.4

### Patch Changes

- b9b986d: Patching vulnerable dependencies
- Updated dependencies [b9b986d]
  - @outputai/core@0.1.4

## 0.1.3

### Patch Changes

- 2547029: Add `credential:` env var convention for automatic secret resolution at worker startup.

  `core`: add `WORKER_BEFORE_START` lifecycle event and `onBeforeStart` hook.

  `credentials`: add `resolveCredentialRefs()` that resolves `credential:<dot.path>` env vars from encrypted credentials, auto-registered via `onBeforeStart` on import.

  `cli`: scaffold build script now copies `*.key` files to `dist/` alongside `*.yml.enc`.

- Updated dependencies [2547029]
  - @outputai/core@0.1.3

## 0.1.2

### Patch Changes

- @outputai/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [ec4c478]
  - @outputai/core@0.1.1
