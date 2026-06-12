---
"output-api": patch
---

`getWorkflowResult` now fetches only the first history event (`WorkflowExecutionStarted`) to extract the workflow input, instead of paging through the full event history. Makes `/workflow/:id/result` input extraction O(1) regardless of history size.
