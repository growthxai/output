---
"@outputai/core": patch
---

Attribute signal emission is now opt-in via `OUTPUT_ENABLE_ATTRIBUTE_SIGNAL_EMISSION=true`. Each LLM call and HTTP request previously fired a Temporal signal back to the workflow, bloating workflow history on runs with many calls. With emission off (the new default), workflow results still expose `attributes` and `aggregations` keys but they are empty/zeroed, and the `cost:llm:request` / `cost:http:request` hooks do not fire. Set the env var on the worker process to opt back in.
