# @outputai/http

## 0.3.1

### Patch Changes

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

- bc8ccee: - HTTP: Added a new event `cost:http:request` that is dispatched after calling `addRequestCost()`: the event's payload is `requestId`, `cost` and `url`;
  - LLM: Renamed `llm:call_cost` event to `cost:llm:request`;
  - LLM: Updated the format of the `.cost` property on `.generateText()` response and on the cost hook payload: `components` is now an array;
  - LLM: Updated `.streamText()` `onFinish()` callback to have the `.cost` property: contains the calculated cost for the stream.
- 23c3ed0: Adding trace event attributes and adding method `addRequestCost` to attach cost related info to an HTTP call made with the http module
- fd72d95: ## Custom fetch
  Added a `fetch` function export to the "http" module:

  - Fully compliant with the fetch [spec](https://fetch.spec.whatwg.org/);
  - Integrates with Traces, tracking requests, responses, errors and failures;

  ## Updated http client

  Refactored `httpClient` exported by "http" to use the custom _fetch_ internally instead of _ky_ hooks.

- Updated dependencies [2809e50]
- Updated dependencies [b87b58f]
- Updated dependencies [899ddaf]
- Updated dependencies [756d32d]
- Updated dependencies [0cbee89]
- Updated dependencies [23c3ed0]
  - @outputai/core@0.3.0

## 0.2.0

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

## 0.1.12

### Patch Changes

- Updated dependencies [76bcede]
- Updated dependencies [3ed2168]
  - @outputai/core@0.1.12

## 0.1.11

### Patch Changes

- @outputai/core@0.1.11

## 0.1.10

### Patch Changes

- 41ecc1b: Updating dependencies to latest and overriding version to fix vulnerabilities
- Updated dependencies [41ecc1b]
  - @outputai/core@0.1.10

## 0.1.9

### Patch Changes

- @outputai/core@0.1.9

## 0.1.8

### Patch Changes

- @outputai/core@0.1.8

## 0.1.7

### Patch Changes

- ac7fc2b: Bumping dependecies minor, patch versions
- Updated dependencies [ac7fc2b]
  - @outputai/core@0.1.7

## 0.1.6

### Patch Changes

- @outputai/core@0.1.6

## 0.1.5

### Patch Changes

- @outputai/core@0.1.5

## 0.1.4

### Patch Changes

- b9b986d: Patching vulnerable dependencies
- Updated dependencies [b9b986d]
  - @outputai/core@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [2547029]
  - @outputai/core@0.1.3

## 0.1.2

### Patch Changes

- @outputai/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [ec4c478]
  - @outputai/core@0.1.1
