---
"@outputai/core": patch
"@outputai/credentials": patch
"@outputai/cli": patch
---

Add `credential:` env var convention for automatic secret resolution at worker startup.

`core`: add `WORKER_BEFORE_START` lifecycle event and `onBeforeStart` hook.

`credentials`: add `resolveCredentialRefs()` that resolves `credential:<dot.path>` env vars from encrypted credentials, auto-registered via `onBeforeStart` on import.

`cli`: scaffold build script now copies `*.key` files to `dist/` alongside `*.yml.enc`.
