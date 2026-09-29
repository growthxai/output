---
"output-api": minor
"@outputai/core": minor
"@outputai/cli": minor
---

Added support for Temporal search attributes on workflow runs:

- Added an optional `searchAttributes` map to `/workflow/run` and `/workflow/start`. Unregistered attributes or mistyped values return 400 and the workflow is not started.
- Added a `--search-attributes` flag to `output workflow run` and `output workflow start`.
- Added `workflowDetails.searchAttributes` to hook payloads, with `Datetime` values as ISO strings.
- Updated child workflows to inherit their parent's search attributes, excluding Temporal system attributes.
