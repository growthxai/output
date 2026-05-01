---
"@outputai/cli": patch
---

Shadow the worker container's `/app/node_modules` (root pnpm store) with a named Docker volume and run an explicit `output:worker:install` before `output:worker:watch`, so Linux-native packages installed in the container no longer leak into the host's `node_modules/`.
