---
"@outputai/cli": patch
---

Improved the dev TUI experience with clearer workflow run views, expanded full-screen modals, and more consistent layout and interaction patterns across screens.

Workflow run details now show result attributes and aggregations alongside input/output data.

For scaffolded projects running `output dev`, the local Docker Compose API service now uses the documented `OUTPUT_AWS_*` variables for remote S3 trace access. If you use remote trace storage locally, set `OUTPUT_AWS_REGION`, `OUTPUT_AWS_ACCESS_KEY_ID`, and `OUTPUT_AWS_SECRET_ACCESS_KEY` in your project environment; the accidental `AWS_*` passthrough is no longer used.
