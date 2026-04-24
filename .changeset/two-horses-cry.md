---
"@outputai/cli": patch
---

Fix `--yes` / `--non-interactive` flags being rejected as "Nonexistent flag" by oclif's per-command parser. The init hook now strips these global flags from `process.argv` after flipping the non-interactive state, so they reach the hook but not the command-level flag validator.
