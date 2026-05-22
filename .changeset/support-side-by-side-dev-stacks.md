---
"@outputai/cli": patch
---

Support multiple `npx output dev` stacks side-by-side:

- Expose `OUTPUT_TEMPORAL_HOST_PORT` (default 7233) so dev Temporal can be relocated off 7233.
- Document the multi-stack recipe (`DOCKER_SERVICE_NAME`, `OUTPUT_CATALOG_ID`, and the three `OUTPUT_*_HOST_PORT` knobs) in `cli.mdx`.
- Surface an actionable hint when docker compose fails to bind a host port, naming the conflicting port and the env var that overrides it.
