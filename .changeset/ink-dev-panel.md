---
"@outputai/cli": patch
---

Replaced log-update/ANSI output in `output dev` with an Ink-based terminal UI, fixing a layout bug where text overlapped after a Docker service recovered from unhealthy. The dev panel now re-renders correctly on all state transitions.
