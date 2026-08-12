---
"@outputai/core": patch
---

- Workflow errors passed to `onWorkflowError` and workflow-sourced `onError` are rehydrated to `Error` instances after crossing the Temporal sandbox (preserving `name`, `message`, `cause`, and other enumerable properties).
