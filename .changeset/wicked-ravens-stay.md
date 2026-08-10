---
"@outputai/llm": patch
---

- Added `'google-vertex'` provider name support to use the `@ai-sdk/google-vertex` provider, the previous `'vertex'` is still supported as an alias, and it is deprecated;
- Added `'amazon-bedrock'` provider name support to use the `@ai-sdk/amazon-bedrock` provider, the previous `'bedrock'` is still supported as an alias, and it is deprecated;
- Fixed a bug causing the wrong model to be used to calculate LLM costs when the model name was referenced by another provider.
