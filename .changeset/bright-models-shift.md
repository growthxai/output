---
"@outputai/llm": minor
---

- Updated `@outputai/llm` to AI SDK 7 and its compatible provider majors: `ai` 7.x; OpenAI, Anthropic, Azure, and Perplexity 4.x; and Amazon Bedrock and Google Vertex 5.x.
- Renamed stream completion callbacks and their exported wrapped types from `onFinish` to `onEnd` in `streamText()` and `Agent.stream()`.
- Updated the `aiSdk` namespace to expose the AI SDK 7 API, including `isStepCount()` instead of `stepCountIs()`.
- Updated `onChunk` to receive every AI SDK 7 stream part, including start, finish, error, step-boundary, text-boundary, and reasoning-boundary parts. Handlers should ignore part types they do not use.
- Updated `Agent` so it no longer inherits from the AI SDK `ToolLoopAgent`. Its public methods remain `generate()`, `generateWithStreaming()`, and `stream()`.
- Updated cache-read, cache-write, text-output, and reasoning token cost calculation to use AI SDK 7 usage breakdowns, with aggregate input or output usage as the fallback for incomplete breakdowns.
- Added normalized usage and cost items with `group` (`input` or `output`) and optional labels (`no_cache`, `cache_read`, `cache_write`, `text`, or `reasoning`). The existing `cost:llm:request` event keeps its legacy usage types for compatibility.
- Fixed legacy `llm:usage` output accounting: when reasoning tokens are provided as a discrete item, they are no longer included in the item for output tokens, removing the double counting problem.
- Added normalized `LLMUsage` and `LLMCost` trace attributes with provider/model identity, aggregate totals, detailed items, and completeness/pricing statuses.
- Added the `llm:generation:metering` event. It is emitted with normalized usage even when cost is unavailable:
  ```json
  {
    "usage": {
      "type": "llm:generation:usage",
      "providerId": "openai",
      "modelId": "gpt-4o",
      "status": "complete",
      "input": 217,
      "output": 9,
      "total": 226,
      "items": [
        { "group": "input", "label": "no_cache", "amount": 217 },
        { "group": "output", "label": "text", "amount": 9 }
      ]
    },
    "cost": {
      "type": "llm:generation:cost",
      "providerId": "openai",
      "modelId": "gpt-4o",
      "status": "precise",
      "input": 0.001085,
      "output": 0.000135,
      "total": 0.00122,
      "items": [
        { "group": "input", "label": "no_cache", "amount": 217, "ppm": 5, "total": 0.001085, "status": "ok" },
        { "group": "output", "label": "text", "amount": 9, "ppm": 15, "total": 0.000135, "status": "ok" }
      ]
    }
  }
  ```
