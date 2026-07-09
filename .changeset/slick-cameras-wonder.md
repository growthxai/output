---
"@outputai/llm": patch
---

Refactored Anthropic's error `"Grammar compilation timed out."` handling not to throw `FatalError` as this is transient and `FatalError`s terminate the workflow execution without retries.

It seems that the Anthropic API throws this error (HTTP status code 400) when grammar compilation times out for a structured output schema, but after some investigation it was assessed that this error is indeed transient.
