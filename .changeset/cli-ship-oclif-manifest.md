---
"@outputai/cli": patch
---

Ship `oclif.manifest.json` in the published package, cutting CLI startup from ~2.1s to ~0.3–0.6s.

The manifest was already listed in `files` (and gitignored), but nothing ever generated it, so the published package shipped without it. Without a manifest, oclif discovers commands by importing every module under `dist/commands` on every invocation — ~1,200+ ES modules including `@anthropic-ai/claude-agent-sdk`, ink/react/yoga-layout, `@aws-sdk/client-s3`, and the TypeScript compiler (via tsx) — just to run `output --version`. With the manifest, oclif lazy-loads only the invoked command.

The manifest is generated as part of `build` (not `prepack`/`postpack`) because the workspace sets `ignoreScripts: true`, which would silently skip pack lifecycle hooks during `pnpm publish`.
