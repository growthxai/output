---
"@outputai/cli": minor
---

Add `output migrate` command for upgrading projects between versions of the Output framework.

The command reads the project's current `@outputai/*` version, fetches the matching migration guide from `docs.output.ai/migrations`, applies the steps, bumps dependencies, and runs the project's type checker. If the user is jumping multiple boundaries, it chains the guides covering the full range.

Under the hood the CLI invokes `/output-migrate` — a Claude Code skill shipped via the `outputai` plugin marketplace. The skill carries the migration logic but no version-specific content; it fetches every guide at runtime so the docs remain the source of truth.
