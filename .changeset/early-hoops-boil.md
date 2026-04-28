---
"@outputai/http": patch
"@outputai/llm": patch
---

- Emitting "cost:http:request" event when attaching cost to an HTTP request using `addRequestCost()`;
- Adding `.cost` property to all responses from LLM with the calculated costs of the call;
