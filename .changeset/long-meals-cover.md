---
"@outputai/cli": patch
---

- Offer to initialize a git repository when running `output init`. Adds a `--skip-git` flag to opt out in non-interactive / scripted use.
- Fix `--yes` / `--non-interactive` being rejected as "Nonexistent flag" by oclif's per-command parser when passed to any command.
