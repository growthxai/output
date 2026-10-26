---
"@outputai/core": minor
"@outputai/cli": patch
"@outputai/evals": patch
---

Folded `@outputai/llm` as a feature of `@outputai/core`, under the `@outputai/core/llm` entry point. Usage is the same: replace `@outputai/llm` imports with `@outputai/core/llm`. The `@outputai/llm` package is no longer published. Other changes are:

- Added `ai` as a peer dependency of `@outputai/core`, and the built-in AI SDK providers (`@ai-sdk/amazon-bedrock`, `@ai-sdk/anthropic`, `@ai-sdk/azure`, `@ai-sdk/google-vertex`, `@ai-sdk/openai` and `@ai-sdk/perplexity`) as optional peer dependencies. Install the providers your prompts use; using a provider whose package is not installed throws a `FatalError` naming the package to install.
- Changed `getProviderNames()` to list only the built-in providers whose package is installed, plus registered ones.
- Removed `@outputai/llm` from `@outputai/output`.
- Updated the CLI project templates and agent instructions to use `@outputai/core/llm`, and added `@ai-sdk/anthropic` and `@ai-sdk/openai` to the project template.
- Deprecated `Path` in `@outputai/core/sdk/helpers`.

The `llm:generation:metering` and `cost:llm:request` events and the LLM trace attributes are unchanged.
