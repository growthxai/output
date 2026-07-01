# @outputai/evals

## 0.9.1

### Patch Changes

- Updated dependencies [0964a83]
- Updated dependencies [0964a83]
  - @outputai/core@0.9.1
  - @outputai/llm@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [ec4c07d]
- Updated dependencies [4b5c049]
- Updated dependencies [ad732b1]
- Updated dependencies [42a0ddf]
  - @outputai/core@0.9.0
  - @outputai/llm@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [aa8ed5e]
  - @outputai/core@0.8.1
  - @outputai/llm@0.8.1

## 0.8.0

### Patch Changes

- Updated dependencies [5485680]
- Updated dependencies [0e958f3]
- Updated dependencies [5485680]
- Updated dependencies [5485680]
- Updated dependencies [5485680]
- Updated dependencies [5485680]
- Updated dependencies [5485680]
  - @outputai/core@0.8.0
  - @outputai/llm@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [383b24b]
- Updated dependencies [5d7e612]
- Updated dependencies [1f47248]
- Updated dependencies [2cc4685]
- Updated dependencies [34badf9]
- Updated dependencies [0d08ff5]
- Updated dependencies [383b24b]
- Updated dependencies [fc6a93e]
- Updated dependencies [f8d698e]
  - @outputai/core@0.7.0
  - @outputai/llm@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [bdf47aa]
- Updated dependencies [69060d7]
  - @outputai/core@0.6.0
  - @outputai/llm@0.6.0

## 0.5.2

### Patch Changes

- Updated dependencies [17d8711]
- Updated dependencies [cc8a372]
  - @outputai/core@0.5.2
  - @outputai/llm@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies [93f660c]
- Updated dependencies [8e45051]
  - @outputai/core@0.5.1
  - @outputai/llm@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies [43c9293]
- Updated dependencies [ae3ab85]
- Updated dependencies [6bc541c]
- Updated dependencies [d43aa3d]
  - @outputai/core@0.5.0
  - @outputai/llm@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [b23002f]
- Updated dependencies [33928d3]
- Updated dependencies [b4a190e]
- Updated dependencies [7ccc4fe]
  - @outputai/llm@0.4.0
  - @outputai/core@0.4.0

## 0.3.2

### Patch Changes

- @outputai/core@0.3.2
- @outputai/llm@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [00e0047]
  - @outputai/llm@0.3.1
  - @outputai/core@0.3.1

## 0.3.0

### Patch Changes

- b87b58f: ## Dependencies updates

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

- Updated dependencies [2809e50]
- Updated dependencies [b87b58f]
- Updated dependencies [bc8ccee]
- Updated dependencies [05462f4]
- Updated dependencies [899ddaf]
- Updated dependencies [756d32d]
- Updated dependencies [0cbee89]
- Updated dependencies [23c3ed0]
- Updated dependencies [815b3a9]
  - @outputai/core@0.3.0
  - @outputai/llm@0.3.0

## 0.2.0

### Minor Changes

- 4407119: Switch dataset files to multi-case format where each top-level YAML key is the case name. Allows grouping multiple test cases into a single file instead of one file per case.

  The old single-case format (with a top-level `name:` field) is no longer supported — existing files must be migrated to the new format. Treated as minor rather than major because adoption is still early and the migration is mechanical.

### Patch Changes

- f13723b: Updating dependencies:

  - @oclif/plugin-help
  - dotenv
  - json-schema-library
  - react
  - redis
  - undici
  - @noble/ciphers
  - @ai-sdk/amazon-bedrock
  - @ai-sdk/anthropic
  - @ai-sdk/azure
  - @ai-sdk/google-vertex
  - @ai-sdk/openai
  - @ai-sdk/perplexity
  - ai
  - liquidjs

  Adding version overrides to fix vulnerabilities:

  - vite@>=7.1.0 <=7.3.1: `>=7.3.2`
  - hono@<4.12.12: `>=4.12.12`
  - hono@>=4.0.0 <=4.12.11: `>=4.12.12`
  - @hono/node-server@<1.19.13: `>=1.19.13`
  - follow-redirects@<=1.15.11: `>=1.16.0`
  - hono@<4.12.14: `>=4.12.14`
  - axios@>=1.0.0 <1.15.0: `>=1.15.0`
  - protobufjs@<7.5.5: `>=7.5.5`

- Updated dependencies [f13723b]
- Updated dependencies [ac8c0f7]
  - @outputai/core@0.2.0
  - @outputai/llm@0.2.0

## 0.1.12

### Patch Changes

- Updated dependencies [76bcede]
- Updated dependencies [3ed2168]
  - @outputai/core@0.1.12
  - @outputai/llm@0.1.12

## 0.1.11

### Patch Changes

- @outputai/core@0.1.11
- @outputai/llm@0.1.11

## 0.1.10

### Patch Changes

- 41ecc1b: Updating dependencies to latest and overriding version to fix vulnerabilities
- Updated dependencies [41ecc1b]
  - @outputai/core@0.1.10
  - @outputai/llm@0.1.10

## 0.1.9

### Patch Changes

- @outputai/core@0.1.9
- @outputai/llm@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies [f78154c]
  - @outputai/llm@0.1.8
  - @outputai/core@0.1.8

## 0.1.7

### Patch Changes

- ac7fc2b: Bumping dependecies minor, patch versions
- Updated dependencies [ac7fc2b]
  - @outputai/core@0.1.7
  - @outputai/llm@0.1.7

## 0.1.6

### Patch Changes

- @outputai/core@0.1.6
- @outputai/llm@0.1.6

## 0.1.5

### Patch Changes

- @outputai/core@0.1.5
- @outputai/llm@0.1.5

## 0.1.4

### Patch Changes

- b9b986d: Patching vulnerable dependencies
- Updated dependencies [b9b986d]
  - @outputai/core@0.1.4
  - @outputai/llm@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [2547029]
  - @outputai/core@0.1.3
  - @outputai/llm@0.1.3

## 0.1.2

### Patch Changes

- @outputai/core@0.1.2
- @outputai/llm@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [ec4c478]
  - @outputai/core@0.1.1
  - @outputai/llm@0.1.1
