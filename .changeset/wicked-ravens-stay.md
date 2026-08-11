---
"@outputai/llm": minor
---

- Added `'google-vertex'` provider name support to use the `@ai-sdk/google-vertex` provider, the previous `'vertex'` is still supported as an alias, and it is deprecated;
- Added `'amazon-bedrock'` provider name support to use the `@ai-sdk/amazon-bedrock` provider, the previous `'bedrock'` is still supported as an alias, and it is deprecated;
- `registerProvider('vertex', …)` and `registerProvider('bedrock', …)` now throw — register under `'google-vertex'` or `'amazon-bedrock'` instead (see the v0.10 → v0.11 migration guide);
- Fixed a bug causing the wrong model to be used to calculate LLM costs when the model name was referenced by another provider. Cost lookup is now `provider` + `model` against the [models.dev](https://models.dev) catalog, so custom `registerProvider` names that are not models.dev ids correctly get `null` cost instead of an arbitrary provider's rates.
