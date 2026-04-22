---
"@outputai/cli": patch
---

Add `credentials set` command for programmatic credential updates by dot-notation path. Prompts for confirmation when the write would change a value's shape (primitive → object or object → primitive); pass `--yes` to skip in non-interactive environments.
