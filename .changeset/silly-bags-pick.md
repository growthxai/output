---
"@outputai/cli": patch
---

Shadow the worker container's workflow-dir `node_modules` with a named Docker volume so the worker's in-container install no longer leaks Linux-native artifacts onto the host's `node_modules/`.
