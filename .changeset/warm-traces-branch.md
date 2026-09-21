---
"@outputai/core": patch
---

- Fixed activity retries sharing one trace event id. Every attempt reused the activity id, so the tree builder merged all attempts into a single node repeated once per attempt: only the last attempt's input, error and timing survived, and the LLM and HTTP calls of every attempt were listed as children of that one node. Attempts are now traced as `<activityId>:<attempt>`, so each retry is its own node with its own input, output or error, timing and children.
- Fixed webhook trace events being parented on the parent workflow's run id. In a root workflow the event had no parent and was dropped from the trace file; in a child workflow it landed beside the child instead of inside it. These events now parent on the running workflow. A wait whose `resume` signal never arrives is traced as a `webhook` node with a null `endedAt`.
