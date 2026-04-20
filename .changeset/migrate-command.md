---
"@outputai/cli": minor
---

Add `output migrate` command for upgrading projects between versions of the Output framework.

The command detects the current framework version in the project's `package.json`, fetches the matching migration guide from `docs.output.ai/migrations`, applies the changes, bumps dependencies, and runs the project's type checker. If no guide exists for the exact version pair, it falls back to the migrations index and chains the guides that cover the range.

This is paired with two repo-level additions that wire migration content into the docs site:

- A new `/outputai:migrate` Claude Code slash command (shipped via the outputai plugin marketplace) that carries the migration logic. The command fetches guides at runtime instead of embedding version-specific steps in the prompt, so the skill stays small and the docs are the source of truth.
- A changelog and migration guide generator (`ops/generate_docs_from_changesets.mjs`, wired into `ops/bump_release.sh`) that writes each release to `docs/guides/changelog/` as a Mintlify `<Update>` block and, when a changeset body includes a `## Migration` section, writes a dedicated guide under `docs/guides/migrations/v{from}-to-v{to}.mdx` and registers it in `docs.json`.

Contributors shipping a breaking change should add a `## Migration` section to their changeset body. The generator turns it into a live page at `docs.output.ai/migrations/v{from}-to-v{to}` that `output migrate` fetches.
