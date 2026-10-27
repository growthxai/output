---
"@outputai/core": minor
"@outputai/cli": patch
---

Stopped publishing the `@outputai/output` umbrella package. Projects depend on `@outputai/core` and, as a dev dependency, `@outputai/cli` instead. Other changes are:

- Changed the project template to depend on `@outputai/core` and `@outputai/cli` instead of `@outputai/output`.
- Changed `output fix` to replace an `@outputai/output` dependency with `@outputai/core` in `dependencies` and `@outputai/cli` in `devDependencies`, at the same version.
- Changed the `output update` warning about a version range that holds back the CLI so it no longer refers to `@outputai/output`.
- Removed the internal `@outputai/core/sdk/helpers` and `@outputai/core/sdk/runtime` entry points.
- Removed support for the `output-workflow-bundle` package export condition when bundling workflows.
