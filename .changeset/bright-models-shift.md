---
"@outputai/llm": minor
---

- Updated `@outputai/llm` to AI SDK 7 and its compatible provider majors: `ai` 7.x; OpenAI, Anthropic, Azure, and Perplexity 4.x; and Amazon Bedrock and Google Vertex 5.x.
- Renamed stream completion callbacks and their exported wrapped types from `onFinish` to `onEnd` in `streamText()` and `Agent.stream()`.
- Updated the `aiSdk` namespace to expose the AI SDK 7 API, including `isStepCount()` instead of `stepCountIs()`.
- Updated `onChunk` to receive every AI SDK 7 stream part, including start, finish, error, step-boundary, text-boundary, and reasoning-boundary parts. Handlers should ignore part types they do not use.
- Updated `Agent` so it no longer inherits from the AI SDK `ToolLoopAgent`. Its public methods remain `generate()`, `generateWithStreaming()`, and `stream()`.
- Updated cache-read, cache-write, text-output, and reasoning token cost calculation to use AI SDK 7 usage breakdowns, with aggregate input or output usage as the fallback for incomplete breakdowns.
- Renamed the `LLMUsage` components `input_cached` to `input_cache_read` and `reasoning` to `output_reasoning`.
- Added the `LLMUsage` component `input_cache_write`.
