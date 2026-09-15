---
"@outputai/llm": minor
---

Added usage and cost reporting for generations that fail after the model ran. Usage is now collected from the AI SDK lifecycle events as the call progresses, so billing no longer depends on the call returning a response. Attribute, event and error shapes are unchanged - failed calls simply stop being free, which raises reported cost for unchanged traffic. Failures before the first completed step still report nothing, because nothing was spent or reported: authentication, rejected requests, unknown models, connection errors, aborts before the first step, and every `generateImage` error.

- Added billing for `generateText` and `Agent.generate` failures that follow a completed step: output or schema validation (`NoObjectGeneratedError`, `NoOutputGeneratedError`), a tool loop that breaks mid-run, an abort, and post-response code such as an `Agent.generate` message store failure.
- Added billing for `generateTextWithStreaming` and `Agent.generateWithStreaming` failures: a provider error part mid stream, an abort after a completed step, a structured output that never validates, and a message store failure after the stream finished.
- Added billing for `streamText` and `Agent.stream` runs that end on an error part or on an abort with steps already collected.
- Added the abort reason and the structured output rejection to the LLM trace event, so a cancelled stream and an output that never validated are no longer traced as clean calls.
- Updated streamed generations to consume the whole stream after a failure before rethrowing, since step usage is only reported while something keeps reading. A stream that stalls after failing is given 250 ms before the original error is thrown anyway.
- Updated billing to run once per call, so a generation reporting several lifecycle events is metered a single time. Activity retries continue to bill per attempt, because each attempt calls the provider.
