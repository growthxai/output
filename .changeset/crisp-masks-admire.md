---
"@outputai/cli": patch
"@outputai/llm": patch
"output-api": patch
"@outputai/core": patch
"@outputai/credentials": patch
"@outputai/evals": patch
"@outputai/output": patch
"@outputai/http": patch
---
## Dependencies updates

### Vulnerabilities fixed:
- uuid: Missing buffer bounds check in v3/v5/v6 when buf: (bump to `>=14.0.0`)
- postcss: PostCSS has XSS via Unescaped </style> in its CSS Stringify Output (bump to `>=8.5.10`)
- @anthropic-ai/sdk: Claude SDK for TypeScript has Insecure Default File Permissions in Local Filesystem Memory Tool (bump to `>=0.91.1`)

### Root package.json updates
- @changesets/cli: `2.30.0` -> `2.31.0`
- eslint: `10.2.0` -> `10.2.1`
- mintlify: `4.2.520` -> `4.2.536`
- typescript-eslint: `8.58.2` -> `8.59.1`
- vitest: `4.1.4` -> `4.1.5`

### pnpm-workspace.yaml (catalog) updates
- @aws-sdk/client-s3: `3.1031.0` -> `3.1038.0`

### sdk/cli/package.json updates
- @inquirer/prompts: `8.4.1` -> `8.4.2`
- @oclif/core: `4.10.5` -> `4.10.6`
- @oclif/plugin-help: `6.2.44` -> `6.2.45`
- undici: `8.0.2` -> `catalog:`
- orval: `8.8.0` -> `8.9.0`

### sdk/llm/package.json updates
- @ai-sdk/amazon-bedrock: `4.0.95` -> `4.0.96`
- liquidjs: `10.25.5` -> `10.25.7`
