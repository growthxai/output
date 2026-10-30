---
"@outputai/core": patch
"@outputai/cli": patch
"output-api": patch
---

Dependency updates:

- `@hono/node-server`: `2.0.10` -> `2.1.3`, reached through `@modelcontextprotocol/sdk`
- `@modelcontextprotocol/sdk`: `1.31.0` -> `1.32.0`, reached through `@anthropic-ai/claude-agent-sdk`
- `body-parser`: `2.3.0` -> `2.4.0`, reached through `express`
- `fast-uri`: `3.1.8` -> `3.1.9`, reached through `ajv`
- `hono`: `4.13.10` -> `4.13.11`, reached through `@modelcontextprotocol/sdk`
- `ip-address`: `10.7.2` -> `10.7.4`, reached through `@modelcontextprotocol/sdk`
- `qs`: `6.16.0` -> `6.16.1`, reached through `express` and `body-parser`
- `undici`: `7.29.1` -> `7.30.1`, reached through `@ai-sdk/provider-utils`
- `undici`: `8.10.2` -> `8.12.3`
- `zod`: `4.6.5` -> `4.6.6`

Peer dependency ranges:

- `undici` min supported peer dependency version for `@outputai/core` is now `8.12.2`.
- `zod` min supported peer dependency version for `@outputai/core` is now `4.6.6`.
