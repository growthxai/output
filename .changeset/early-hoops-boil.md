---
"@outputai/http": patch
"@outputai/llm": minor
---

- HTTP: Added a new event `cost:http:request` that is dispatched after calling `addRequestCost()`: the event's payload is `requestId`, `cost` and `url`;
- LLM: Renamed `llm:call_cost` event to `cost:llm:request`;
- LLM: Updated the format of the `.cost` property on `.generateText()` response and on the cost hook payload: `components` is now an array;
- LLM: Updated `.streamText()` `onFinish()` callback to have the `.cost` property: contains the calculated cost for the stream.
