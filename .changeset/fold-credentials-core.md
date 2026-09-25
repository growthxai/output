---
"@outputai/core": minor
---

Folded `@outputai/credentials` as a feature of `@outputai/core`, under the `@outputai/core/credentials` entry point. Usage is the same, and credentials are still loaded during worker startup (after workflows are loaded). The `outputai.hookFiles` config is no longer necessary. Other changes are:

- Updated the worker to fail startup when there are errors loading credentials.
- Removed the `onBeforeWorkerStart` hook.

The original `/credentials` behavior and interface were kept, with the exception of these changes:

- Updated to use the encrypted YAML provider as the default.
- Removed unused exports:
  - `getProvider`
  - `encryptedYamlProvider`
  - `MissingCredentialError`
  - `GlobalContext`
  - `WorkflowContext`
- Updated all typed errors to inherit from `FatalError`, so when thrown, they fail the workflow execution. This includes:
  - `MissingKeyError`
  - `MissingCredentialError`
  - `InvalidCredentialsKeyError`
  - `MalformedCredentialsKeyError`
