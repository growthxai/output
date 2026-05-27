---
"@outputai/core": patch
"@outputai/cli": patch
---

Attribute signal emission is now opt-in via `OUTPUT_ENABLE_ATTRIBUTE_SIGNAL_EMISSION=true`. Each LLM call and HTTP request previously fired a Temporal signal back to the workflow, bloating workflow history on runs with many calls. With emission off (the new default), workflow results still expose `attributes` and `aggregations` keys but they are empty/zeroed, and the `cost:llm:request` / `cost:http:request` hooks do not fire. Set the env var on the worker process to opt back in.

The CLI's dev docker-compose forwards the flag from the host shell, so `OUTPUT_ENABLE_ATTRIBUTE_SIGNAL_EMISSION=true output dev` opts in without editing compose.
