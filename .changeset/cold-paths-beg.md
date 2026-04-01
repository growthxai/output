---
"@outputai/cli": patch
---

Fix worker health checks and add yarn/pnpm support in dev container

- Support yarn and pnpm projects via corepack in the dev container worker (OUT-330)
- Fix health check incorrectly reporting success when containers exit or are unhealthy (OUT-334)
- Fix false failure warnings during startup when services are in `starting` state
- Reduce worker health check detection time from ~36s to ~9s (timeout 10s→3s, retries 20→2)
- Extend worker health check start_period from 30s to 60s to reduce false positives on cold start
