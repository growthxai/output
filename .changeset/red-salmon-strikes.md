---
"@outputai/core": minor
---

- Removed workflow-level usage aggregation from `@outputai/core`; workflows no longer collect activity attributes into final `aggregations` totals or expose those totals in workflow run results.
- Reworked workflow-to-workflow invocation so direct workflow calls made from workflow code now consistently execute as Temporal child workflows, including calls made through helper functions outside the parent workflow handler.
- Removed workflow call rewriting from the workflow webpack loader while preserving activity, step, and evaluator call rewriting.
- Renamed workflow invocation configuration types from `WorkflowInvocationConfiguration` to `WorkflowInvocationOptions`.
- Updated workflow invocation options so activity overrides are passed as top-level `activityOptions` instead of the previous `options` property.
- Refactored workflow validation internals around centralized schemas and explicit validator classes for workflows, steps, and evaluators.
- Hardened Zod schema detection for multi-package or multi-realm Zod v4 environments.
