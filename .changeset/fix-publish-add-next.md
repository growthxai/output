---
"@outputai/cli": patch
---

Fix prod publish to include build step before publishing to npm. Previously, packages were published without compiling TypeScript, resulting in missing `dist/` directory. Add `@next` dist-tag that auto-publishes from every merge to main, enabling `npx @outputai/cli@next` for tracking the latest changes.
