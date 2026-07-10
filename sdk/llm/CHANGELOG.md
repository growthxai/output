# @outputai/llm

## 0.10.0

### Patch Changes

- 67c8141: Refactored Anthropic's error `"Grammar compilation timed out."` handling not to throw `FatalError` as this is transient and `FatalError`s terminate the workflow execution without retries.

  It seems that the Anthropic API throws this error (HTTP status code 400) when grammar compilation times out for a structured output schema, but after some investigation it was assessed that this error is indeed transient.

- Updated dependencies [c318502]
- Updated dependencies [105840b]
- Updated dependencies [62d9754]
  - @outputai/core@0.10.0

## 0.9.2

### Patch Changes

- 9d7a870: Pinning v24.15.0 as the minimal supported Node version
- Updated dependencies [9d7a870]
- Updated dependencies [52c7f0a]
  - @outputai/core@0.9.2

## 0.9.1

### Patch Changes

- 0964a83: - Disabled HTTP/2 (`allowH2: false`) in the dispatcher of the fetch client used when consuming the AI SDK and fetching model pricing;
  - Replaced the `Agent` dispatcher in favor of `EnvHttpProxyAgent` to respect the proxy env vars. [OUT-506].
- Updated dependencies [0964a83]
  - @outputai/core@0.9.1

## 0.9.0

### Patch Changes

- 4b5c049: Updating libraries to fix vulnerabilities
- Updated dependencies [ec4c07d]
- Updated dependencies [4b5c049]
- Updated dependencies [ad732b1]
- Updated dependencies [42a0ddf]
  - @outputai/core@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [aa8ed5e]
  - @outputai/core@0.8.1

## 0.8.0

### Minor Changes

- 5485680: Add per-message provider options to `.prompt` files via `messageOptions`.

  - Define named `messageOptions` sets in front matter and attach them to message blocks with `options="<name>"` (e.g. `<system options="cached">`); each set is a provider-namespaced `providerOptions` object merged onto that message.
  - Enables Anthropic prompt caching (`{ anthropic: { cacheControl: { type: ephemeral } } }`) and any other per-message provider option, on any provider.
  - Cost tracking now reports cached input tokens (`input_cached`) even for models whose pricing record lacks a `cache_read` rate, so cache savings are visible in usage aggregations instead of silently disappearing.

### Patch Changes

- 5485680: Route `<system>` blocks to the AI SDK `system` option instead of leaving them in the `messages` array.

  - `loadAiSdkTextOptions` now splits resolved messages: system blocks go to the top-level `system` option (as `SystemModelMessage[]`, so per-message `cacheControl`/`providerOptions` are preserved); only user/assistant/tool messages stay in `messages`. `Agent` consumes the split `system` directly as its `instructions`.
  - Silences the AI SDK warning that system messages in `messages` are a prompt-injection risk; `generateText`/`streamText`/`Agent` also set `allowSystemInMessages: true` as defense-in-depth for caller-supplied message histories.

- Updated dependencies [5485680]
- Updated dependencies [0e958f3]
- Updated dependencies [5485680]
- Updated dependencies [5485680]
- Updated dependencies [5485680]
  - @outputai/core@0.8.0

## 0.7.0

### Minor Changes

- 5d7e612: - Added the `generateImage()` function for image generation, including image model loading, image prompt options, and wrapped image responses;
  - Improved public TS types by deriving AI SDK options and results from the upstream `ai` package;
  - Removed unused TS types;
  - Added validation for prompt skills, text generation arguments, and image prompt options;
  - Updated `streamText()` to support prompt skills and tools consistently with `generateText()`.
- f8d698e: - Updated `@ai-sdk/*` providers and `ai` itself to peer dependencies, with these supported ranges:
  - `ai`: `>=6 <7`
  - `@ai-sdk/amazon-bedrock`: `>=4 <5`
  - `@ai-sdk/anthropic`: `>=3 <4`
  - `@ai-sdk/azure`: `>=3 <4`
  - `@ai-sdk/google-vertex`: `>=4 <5`
  - `@ai-sdk/openai`: `>=3 <4`
  - `@ai-sdk/perplexity`: `>=3 <4`
  - Built-in providers are now initialized lazily. Provider packages are imported when `@outputai/llm` is loaded, but provider instances are created only when first requested by a prompt.
  - No longer re-exports Tavily, Exa, or Perplexity search tool factories.
  - `getRegisteredProviders()` was renamed to `getProviderNames()`.

### Patch Changes

- 2cc4685: - Added runtime image inputs to `generateImage()`, including image-to-image generation and optional masks for image editing;
  - Added validation and TypeScript types for `generateImage()` `images` and `mask` arguments;
  - Added conversion of AI SDK non-retryable API errors to `FatalError` across `generateText()`, `streamText()`, and `generateImage()` so permanent provider failures do not trigger workflow/activity retries:
    - APICallError (when `.isRetriable() === false` )
    - InvalidArgumentError
    - InvalidDataContentError
    - InvalidPromptError
    - LoadAPIKeyError
    - LoadSettingError
    - NoImageGeneratedError
    - NoSuchModelError
    - NoSuchProviderError
    - UnsupportedFunctionalityError
- 34badf9: Fixing vulnerabilities by updating `qs` and `liquidjs` dependencies.
- 383b24b: Exported event payload types for hook consumers.

  - `@outputai/http` now exports `HttpRequestEvent` for `http:request` and `HttpRequestCostEvent` for `cost:http:request`.
  - `@outputai/llm` now exports `LLMUsageEvent` for `cost:llm:request`.

  Use these with `@outputai/core/hooks` as `on<HttpRequestEvent>( 'http:request', handler )`, so applications can type event-specific fields without redefining the payload shapes locally.

- fc6a93e: Recreate AI SDK `NoObjectGeneratedError` schema validation failures as new `NoObjectGeneratedError` instances with a clearer message:

  ```txt
  No object generated: response did not match schema. First issue is "Invalid input: expected string, received number" at path [name].
  ```

- Updated dependencies [383b24b]
- Updated dependencies [1f47248]
- Updated dependencies [0d08ff5]
  - @outputai/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [bdf47aa]
- Updated dependencies [69060d7]
  - @outputai/core@0.6.0

## 0.5.2

### Patch Changes

- Updated dependencies [17d8711]
- Updated dependencies [cc8a372]
  - @outputai/core@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies [93f660c]
- Updated dependencies [8e45051]
  - @outputai/core@0.5.1

## 0.5.0

### Minor Changes

- 43c9293: Workflow runs now return durable usage and cost metadata alongside the workflow output. Each completed or failed run can include raw `attributes` plus convenient `aggregations` for total cost, token usage, and HTTP request counts.

  For example, API and CLI JSON results can now include:

  ```json
  {
    "attributes": [
      {
        "type": "llm:usage",
        "modelId": "gpt-4o",
        "total": 0.00122,
        "tokensUsed": 226
      },
      {
        "type": "http:request:cost",
        "url": "https://api.vendor.com/search",
        "total": 0.42
      }
    ],
    "aggregations": {
      "cost": { "total": 0.42122 },
      "tokens": { "total": 226 },
      "httpRequests": { "total": 1 }
    }
  }
  ```

  Cost events now emit the same attribute-shaped payloads used in workflow results, making hook handlers and saved run metadata easier to reconcile. This also updates `@outputai/http` request cost tracking and `@outputai/llm` response cost data to use the new attribute format.

  Learn more in the [workflow result docs](https://docs.output.ai/api), [CLI result format](https://docs.output.ai/packages/cli#workflow-result-json-format), [cost events guide](https://docs.output.ai/costs/cost-events), and [v0.4.0 to v0.5.0 migration guide](https://docs.output.ai/migrations/v0.4.0-to-v0.5.0).

### Patch Changes

- 6bc541c: Increase built-in LLM provider fetch timeouts for long-running responses.

  Default AI SDK `maxRetries` to 0 so workflow retries are handled by Temporal.

- Updated dependencies [43c9293]
- Updated dependencies [ae3ab85]
- Updated dependencies [d43aa3d]
  - @outputai/core@0.5.0

## 0.4.0

### Patch Changes

- b23002f: Bump `entities` dependency from v6 to v8. The API surface used (`encodeXML` / `decodeXML`) is unchanged, and v8's ESM-only / Node ≥ 20.19 requirements are already satisfied by this package.
- Updated dependencies [33928d3]
- Updated dependencies [b4a190e]
- Updated dependencies [7ccc4fe]
  - @outputai/core@0.4.0

## 0.3.2

### Patch Changes

- @outputai/core@0.3.2

## 0.3.1

### Patch Changes

- 00e0047: Prevent template variables from injecting message blocks into rendered prompts. Variable content containing tag-shaped substrings (e.g. `</user>` or `<system>...</system>`, common when evaluating webpages or chat transcripts) was being tokenized by `parsePrompt` as real message blocks, producing duplicate `system` messages that providers like Anthropic reject. `loadPrompt` now arms every `{{ ... }}` interpolation with an internal escape filter so variable output stays inert at parse time.
  - @outputai/core@0.3.1

## 0.3.0

### Minor Changes

- bc8ccee: - HTTP: Added a new event `cost:http:request` that is dispatched after calling `addRequestCost()`: the event's payload is `requestId`, `cost` and `url`;
  - LLM: Renamed `llm:call_cost` event to `cost:llm:request`;
  - LLM: Updated the format of the `.cost` property on `.generateText()` response and on the cost hook payload: `components` is now an array;
  - LLM: Updated `.streamText()` `onFinish()` callback to have the `.cost` property: contains the calculated cost for the stream.

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

- 05462f4: Update perplexity-ai/ai-sdk to v0.1.3
- 23c3ed0: Adding trace event attributes and adding method `addRequestCost` to attach cost related info to an HTTP call made with the http module
- 815b3a9: re-export ai.jsonSchema for downstream use
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

- ac8c0f7: Bumping dependency versions
- Updated dependencies [f13723b]
- Updated dependencies [ac8c0f7]
  - @outputai/core@0.2.0

## 0.1.12

### Patch Changes

- 76bcede: Add `agent()` and `skill()` abstractions to `@outputai/llm` for composing reusable LLM agents with structured output and a lazy-loaded skills system. Add `findContentDir()` to `@outputai/core` and fix skill path resolution to be relative to the prompt file rather than the calling module. Add `output-copy-assets` bin to `@outputai/core` to centralise worker asset copying.
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

- f78154c: Updating @exalabs/ai-sdk from 1.0.5 to 2.0.1
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
