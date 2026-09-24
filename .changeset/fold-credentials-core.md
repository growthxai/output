---
"@outputai/core": minor
"@outputai/cli": minor
---

- Moved `@outputai/credentials` into core. Import from `@outputai/core/credentials` instead, then remove the `@outputai/credentials` dependency, any hook file that only imports it, and any `outputai.hookFiles` entry pointing at `@outputai/credentials/dist/hooks.js`. The worker now resolves `credential:` env refs itself, after hook files, workflows and activities are loaded.
- The credentials exports are trimmed to `credentials`, `resolveCredentialRefs`, `setProvider`, `encrypt`, `decrypt`, `generateKey`, `InvalidCredentialsKeyError`, `MalformedCredentialsKeyError`, `MissingKeyError`, the path helpers (`getNestedValue`, `resolveCredentialsPath`, `resolveKeyPath`, `resolveKeyEnvVar`, `resolveWorkflowCredentialsPath`, `resolveWorkflowKeyPath`, `resolveWorkflowKeyEnvVar`) and the `CredentialsProvider` type. `getProvider`, `encryptedYamlProvider`, `MissingCredentialError`, `GlobalContext` and `WorkflowContext` are no longer exported. The encrypted YAML provider is now the default, so `setProvider()` is only needed for a custom provider.
- `MissingKeyError`, `InvalidCredentialsKeyError`, `MalformedCredentialsKeyError` and the error thrown by `credentials.require()` now extend `FatalError`, so a step that hits one fails on the first attempt instead of being retried.
- A missing or invalid credentials key while resolving `credential:` env refs now stops the worker at startup. Before, the error was logged and the worker started with the refs unresolved.
- Removed the `onBeforeWorkerStart` hook. It existed only to resolve credential refs, which the worker now does directly.
- The CLI now depends on `@outputai/core` for credentials, and scaffolded projects no longer list a credentials hook file.
- `output fix` now removes `outputai.hookFiles` entries pointing into `@outputai/credentials`, which would otherwise stop the worker from starting.
