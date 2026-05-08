---
"@outputai/cli": patch
---

Fixed `output dev` hanging until the health timeout when `docker compose up` exited before creating containers. The CLI now drains and captures recent Compose output, reports early Compose exits immediately, polls status with the same project directory used to start the stack, and only treats running containers as healthy.
