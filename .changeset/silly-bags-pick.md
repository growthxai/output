---
"@outputai/cli": patch
---

Shadow the worker container's `/app/node_modules` with a named Docker volume so the worker's in-container `npm install` no longer leaks Linux-native binaries onto the host's `node_modules/`.
