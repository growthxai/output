---
"@outputai/core": minor
---

Added `promptName` and `requestDetails` to `LLMGenerationUsage` and `LLMGenerationCost`, so both the `llm:generation:metering` event and the `llm:generation:usage` and `llm:generation:cost` trace attributes carry them for text, streaming, Agent, and image calls. Use `promptName` to group usage and cost by prompt.

`requestDetails` (new `LLMRequestDetails` type) holds `ids`, the provider request ID of every request in request order, read from the `request-id` response header and then `x-request-id`, and empty when the provider exposes neither; `count`, the number of provider requests; and `duration`, the milliseconds, rounded up, from the start of the call until billing starts. The legacy `cost:llm:request` event and `llm:usage` attribute are unchanged.
