---
"@outputai/core": patch
---

- Fix TypeScript declaration emit for exported workflows that use Zod schemas.
- Allow TypeScript to generate `.d.ts` files for these workflows without non-portable Zod references.
- Treat Zod as a peer dependency and avoid leaking schema-specific workflow context types through the invocation config.
