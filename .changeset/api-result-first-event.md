---
"output-api": patch
---

`getWorkflowResult` now fetches only the first history event (`WorkflowExecutionStarted`) to extract the workflow input, instead of paging through the full event history. Makes input extraction on the result endpoints (`/workflow/:id/result` and `/workflow/:id/runs/:rid/result`) O(1) regardless of history size.
