---
"@outputai/core": patch
---

- Fixed activity trace event ids colliding across attempts and across workflows. Temporal numbers activity ids per workflow run and reuses them on retry, so every attempt of an activity shared one id, and a parent and its child workflow both produced an `act-1`. The tree builder merged the colliding entries: only the last attempt's input, error and timing survived, the LLM and HTTP calls of every attempt were listed as children of that one node, and a nested workflow's step surfaced a second time as a phantom node directly under the root. Activities are now traced as `<runId>:<activityId>:<attempt>`, so each attempt in each run is its own node with its own input, output or error, timing and children.
- Fixed webhook trace events being parented on the parent workflow's run id. In a root workflow the event had no parent and was dropped from the trace file; in a child workflow it landed beside the child instead of inside it. These events now parent on the running workflow. A wait whose `resume` signal never arrives is traced as a `webhook` node with a null `endedAt`.
