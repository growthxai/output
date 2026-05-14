---
"@outputai/cli": patch
---

The `output dev` docker-compose template now bind-mounts `${PWD}/logs:${PWD}/logs:ro` on the `api` service. The new `GET /workflow/{id}/trace-attributes` endpoint reads the host-absolute path stored in `result.trace.destinations.local` via `fs.readFile`; without this mount the api container returned `ENOENT` and the endpoint was unusable in local dev mode. Read-only and dev-only (the same compose file isn't shipped to prod).
