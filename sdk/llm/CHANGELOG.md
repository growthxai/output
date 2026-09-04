# @outputai/llm

## 0.13.0

### Minor Changes

- 69255d7: Added support for pricing Gemini grounded search, which providers bill per request rather than per token. `LLMGenerationUsage` and `LLMGenerationCost` items gain a `request` group alongside `input` and `output`. The legacy `cost:llm:request` payload is unchanged and does not carry grounding charges — its shape is frozen, so grounding costs are only visible on the new normalized attribute.

  `output workflow cost` prices these request-based charges and marks any call with an unpriced charge (grounding or otherwise) with a `*` and a "cost incomplete" footnote, since the reported total understates the actual bill.

### Patch Changes

- @outputai/core@0.13.0

## 0.12.0

### Minor Changes

- da26845: - Updated `@outputai/llm` to AI SDK 7 and its compatible provider majors: `ai` 7.x; OpenAI, Anthropic, Azure, and Perplexity 4.x; and Amazon Bedrock and Google Vertex 5.x.
  - Renamed stream completion callbacks and their exported wrapped types from `onFinish` to `onEnd` in `streamText()` and `Agent.stream()`.
  - Updated the `aiSdk` namespace to expose the AI SDK 7 API, including `isStepCount()` instead of `stepCountIs()`.
  - Updated `onChunk` to receive every AI SDK 7 stream part, including start, finish, error, step-boundary, text-boundary, and reasoning-boundary parts. Handlers should ignore part types they do not use.
  - Updated `Agent` so it no longer inherits from the AI SDK `ToolLoopAgent`. Its public methods remain `generate()`, `generateWithStreaming()`, and `stream()`.
  - Updated cache-read, cache-write, text-output, and reasoning token cost calculation to use AI SDK 7 usage breakdowns, with aggregate input or output usage as the fallback for incomplete breakdowns.
  - Added normalized usage and cost items with `group` (`input` or `output`) and optional labels (`no_cache`, `cache_read`, `cache_write`, `text`, or `reasoning`). The existing `llm:usage` trace attribute and `cost:llm:request` event remain available with their legacy payload for compatibility.
  - Fixed legacy `llm:usage` output accounting: when reasoning tokens are provided as a discrete item, they are no longer included in the item for output tokens, removing the double counting problem.
  - Added normalized `LLMGenerationUsage` and `LLMGenerationCost` trace attributes with provider/model identity, aggregate totals, detailed items, and completeness/pricing statuses.
  - Added the `llm:generation:metering` event. It is emitted with normalized usage even when cost is unavailable:
    ```json
    {
      "usage": {
        "type": "llm:generation:usage",
        "providerId": "openai",
        "modelId": "gpt-4o",
        "status": "complete",
        "input": 217,
        "output": 9,
        "total": 226,
        "items": [
          { "group": "input", "label": "no_cache", "amount": 217 },
          { "group": "output", "label": "text", "amount": 9 }
        ]
      },
      "cost": {
        "type": "llm:generation:cost",
        "providerId": "openai",
        "modelId": "gpt-4o",
        "status": "precise",
        "input": 0.001085,
        "output": 0.000135,
        "total": 0.00122,
        "items": [
          {
            "group": "input",
            "label": "no_cache",
            "amount": 217,
            "ppm": 5,
            "total": 0.001085,
            "status": "ok"
          },
          {
            "group": "output",
            "label": "text",
            "amount": 9,
            "ppm": 15,
            "total": 0.000135,
            "status": "ok"
          }
        ]
      }
    }
    ```
- a5ded18: Added support for passing a loaded or custom `Prompt` object directly to `generateText()`, `generateTextWithStreaming()`, `streamText()`, `generateImage()`, and the `Agent` constructor. Prompt filename strings remain supported; `variables` and `promptDir` apply only when loading a prompt by filename.
- b3beef1: ## Skills

  - Fixed implicit and inconsistent skill loading by making prompt frontmatter the only skills definition:
    - Removed the `skills` argument from `generateText()`, `streamText()`, `generateTextWithStreaming()`, and `Agent`.
    - Removed the `skills/` auto-discovery.
    - Removed the `skill()` helper and the `Skill` and `SkillsArg` types.
    - Fixed configured skill directories silently omitting Markdown files in nested folders. Directory loading is recursive and sorted.
    - Fixed skill discovery following symbolic links. Symbolic links are ignored.

  ## Call signatures and validation

  - Fixed unrestricted native AI SDK call arguments bypassing validation and overriding prompt-owned model/configuration. Generation and Agent APIs now reject unsupported or misplaced arguments before provider I/O. Removed native AI SDK call arguments from `generateText()`, `generateTextWithStreaming()`, `streamText()`, `generateImage()`, and `Agent`, as well as `skills` and `maxSteps`. These are the supported arguments:

    | Argument      | `generateText` | `generateTextWithStreaming` | `streamText` | `generateImage` |
    | ------------- | -------------- | --------------------------- | ------------ | --------------- |
    | `prompt`      | required       | required                    | required     | required        |
    | `promptDir`   | optional       | optional                    | optional     | optional        |
    | `variables`   | optional       | optional                    | optional     | optional        |
    | `tools`       | optional       | optional                    | optional     | -               |
    | `output`      | optional       | optional                    | optional     | -               |
    | `toolChoice`  | optional       | optional                    | optional     | -               |
    | `stopWhen`    | optional       | optional                    | optional     | -               |
    | `abortSignal` | optional       | optional                    | optional     | optional        |
    | `onChunk`     | -              | optional                    | optional     | -               |
    | `onEnd`       | -              | -                           | optional     | -               |
    | `onError`     | -              | -                           | optional     | -               |
    | `images`      | -              | -                           | -            | optional        |
    | `mask`        | -              | -                           | -            | optional        |

    | Argument       | `new Agent` | `.generate` | `.generateWithStreaming` | `.stream` |
    | -------------- | ----------- | ----------- | ------------------------ | --------- |
    | `prompt`       | required    | -           | -                        | -         |
    | `promptDir`    | optional    | -           | -                        | -         |
    | `variables`    | optional    | -           | -                        | -         |
    | `tools`        | optional    | -           | -                        | -         |
    | `output`       | optional    | -           | -                        | -         |
    | `stopWhen`     | optional    | -           | -                        | -         |
    | `messageStore` | optional    | -           | -                        | -         |
    | `messages`     | -           | optional    | optional                 | optional  |
    | `abortSignal`  | -           | optional    | optional                 | optional  |
    | `toolChoice`   | -           | optional    | optional                 | optional  |
    | `onChunk`      | -           | -           | optional                 | optional  |
    | `onEnd`        | -           | -           | -                        | optional  |
    | `onError`      | -           | -           | -                        | optional  |

    - Fixed callers being able to replace the prompt model while traces and cost used the prompt provider/model.
    - Fixed unsupported callbacks on completion APIs being silently overwritten by internal callbacks.
    - Fixed Agent using AI SDK's two automatic retries while other Output generation APIs disabled them. Agent now uses `maxRetries: 0`.
    - Added the public `GenerateImageInput` type for `generateImage()` `images` and `mask` values.
    - Fixed `GenerateImageParameters` allowing `mask` without `images`; the public type now matches runtime validation.

  - Fixed invalid Agent constructor and method arguments being forwarded for late failure by validating messages, callbacks, tool choices, and `MessageStore` implementations at the public boundary.

  ## Tools and tool loops

  - Fixed tool handling:
    - Fixed call-argument tools overriding prompt tools. They now merge (caller wins on the same key; `load_skill` is last).
    - Fixed prompt-only native tools missing the tool-loop limit. They now use `stopWhen: isStepCount(maxSteps)` from the prompt (default 10).
    - Fixed non-callable provider tool entries failing later with an opaque `TypeError`. They now fail provider-tool validation.

  ## Prompt files

  - Fixed loaded prompt shape inconsistencies:
    - Renamed `Prompt.promptFileDir` to `Prompt.fileDir`.
    - Added `PromptVariables` (`Record<string, unknown>`, including nested objects and arrays) and `Prompt.variables` (default `{}`). LLM API `variables` arguments use the same type.
    - Fixed `Prompt.config.skills` varying between missing, a string, and a string array. It is always a `string[]` after load.
    - Added `Prompt.config.maxSteps` (positive integer, default 10). It replaces the old argument and is required on the public type.
    - Fixed `Prompt.instructions` allowing `undefined` in its public contract. It is always `string | null` after load (chat prompts are `null`).
    - Narrowed `PromptMessage.role` from `string` to `'system' | 'user' | 'assistant'`, matching authored prompt blocks.
    - Fixed per-message options remaining unresolved until generation. `options="<name>"` is resolved during `loadPrompt` against `config.messageOptions` into optional `PromptMessage.providerOptions`; `PromptMessage.attributes` is removed.
  - Fixed prompt body scanning silently dropping text, accepting malformed structure, or truncating messages by replacing it with explicit instruction and message modes:
    - Fixed mode detection so plain text as the first meaningful body token selects instruction mode and preserves the complete body, while a tag selects message mode.
    - Clarified that text generation APIs require message mode, while `generateImage()` requires instruction mode.
    - Restricted message mode to top-level `system`, `user`, and `assistant` blocks, with no root text between blocks.
    - Fixed prompt files accepting authored `<tool>` blocks as string messages even though AI SDK requires structured tool-result parts. They now fail at load; structured tool messages remain supported through Agent `messages` and `messageStore`.
    - Added explicit errors for invalid roles, root self-closing or unmatched closing tags, unclosed blocks, and malformed attributes.
    - Fixed nested non-self-closing tags with the same name closing the outer block early. They now throw with an `&lt;tag&gt;` escape hint; different-name tags remain message content.
    - Fixed closing tags inside HTML comments prematurely terminating and truncating messages.
    - Fixed role-tag casing and closing-tag whitespace being misclassified as instructions. Role tags are case-insensitive and allow whitespace inside closing tags.
    - Added support for spaces around attribute `=` and `>` inside quoted values. Bare `options`, unknown option names, and invalid quote pairs throw at load.
    - Fixed empty or whitespace-only `options` values invalidating templated prompts. They now behave as no per-message options.
  - Fixed prompt file `config` accepting ignored or invalid values:
    - Unknown top-level keys throw.
    - `model` must be a non-empty string.
    - Added support for the native AI SDK generation properties `maxOutputTokens`, `topP`, `topK`, `presencePenalty`, `frequencyPenalty`, `stopSequences`, and text-generation `seed`.
    - Deprecated `maxTokens` in favor of `maxOutputTokens`. Existing prompts remain compatible: `loadPrompt` retains `maxTokens` and copies its value to `maxOutputTokens` when the canonical key is absent. When both keys are set, `maxOutputTokens` takes precedence. Each key must be a positive integer when provided.

  ## Streaming and Agent message store

  - Fixed stream observer failures escaping or disappearing silently. `streamText()` and `Agent.stream()` `onError` and `onEnd` callbacks are fire-and-forget observers. Output maps and forwards provider errors, and logs and ignores observer exceptions and rejected promises.
  - Added logging for internal stream finalization failures before AI SDK suppresses the callback rejection.
  - Updated Agent message store:
    - Renamed `conversationStore` to `messageStore` and `ConversationStore` to `MessageStore`.
    - Removed `createMemoryConversationStore()`. The caller supplies a `MessageStore` (`getMessages` / `addMessages`).
    - Fixed `Agent.generate()`, `Agent.generateWithStreaming()`, and `Agent.stream()` to persist to `messageStore` only when `finishReason` is not `'error'`.
    - Fixed stream message-store failures suppressing the user `onEnd`. Failures are logged and stream finalization continues.
    - Fixed Agent store failures producing success-then-error trace sequences. Store persistence completes before a successful trace end.

  ## Tracing, sources, and response types

  - Fixed inconsistent and incomplete LLM trace payloads across `generateText()`, `streamText()`, `generateTextWithStreaming()`, `generateImage()`, and `Agent`:
    - Updated start `input` to `{ prompt }` (the loaded object). Removed the v0.11 filename `prompt`, sibling `variables`, and `loadedPrompt`.
    - Renamed `sourcesFromTools` to `sources` (merged tool + provider sources).
    - Fixed source merge dropping provider document sources that have `id` but no `url`.
    - Fixed blank or untrimmed search URLs producing invalid citations or unstable source IDs. URLs are trimmed and blank values are dropped.
    - Fixed wrapped text responses not consistently exposing `sources` as an array.
    - Updated `ExtractedSource` to the AI SDK `generateText` sources item type (url and document).
  - Fixed concurrent same-name LLM calls started in the same millisecond sharing trace IDs.
  - Fixed aborted `streamText()` and `Agent.stream()` calls leaving their LLM trace open. Aborts now conclude the trace with an error.
  - Fixed public cost, source, and stream callback types to match wrapped runtime values. `response.cost` and stream `onEnd` `cost` use `LLMGenerationCost`, or `null` when pricing data is unavailable. Stream `onEnd` types also include wrapped `result` and merged `sources`.

  ## AI SDK exports and public parameter types

  - Renamed the AI SDK namespace re-export from `ai` to `aiSdk` (both code and types).
  - Removed named AI SDK re-exports (`tool`, `Output`, `smoothStream`, `stepCountIs`, `hasToolCall`, `jsonSchema`) and AI SDK type re-exports (`ToolSet`, `FinishReason`, `ModelMessage`, and others). Use the `aiSdk` namespace (or import from `ai`) for those.
  - Removed the Output-owned `GenerateTextAiSdkOptions`, `StreamTextAiSdkOptions`, and `GenerateImageAiSdkOptions` aliases. Use `GenerateTextParameters`, `StreamTextParameters`, and `GenerateImageParameters`.
  - Updated `OutputAgentGenerateWithStreamingParameters` to no longer accept an output type argument.
  - Removed test specs and fixtures from the published package tarball.

- 90d8cc0: Added `generateTextWithStreaming()` and `Agent.generateWithStreaming()`, which return complete results like `generateText()` and `Agent.generate()` while using streaming internally. Callers can observe progress through `onChunk`. Failures reject the returned promise.

### Patch Changes

- 90d8cc0: Fixed `Agent.stream()` and `Agent.generate()` to map AI SDK failures to framework errors consistently with `generateText()`. Non-retryable AI SDK failures now become `TransparentFatalError`, so affected activities fail without retrying. `Agent.stream()` now also awaits asynchronous stream setup failures.
- Updated dependencies [da26845]
  - @outputai/core@0.12.0

## 0.11.0

### Minor Changes

- 09ed166: Added stricter LiquidJs settings for prompt files parsing. The following configurations were added:
  ```js
  {
    strictFilters: true,
    strictVariables: true,
    lenientIf: true
  }
  ```
- 46d9d66: - Permanent AI SDK failures now surface in logs, traces, hooks, and workflow results as the original AI SDK error (for example `AI_APICallError`) instead of a wrapping `FatalError` whose message started with `AI-SDK fatal error`.
  - Schema-mismatch `NoObjectGeneratedError` messages are no longer rewritten to append `First issue is "…" at path […]`. The AI SDK error (and its Zod cause chain) is returned unchanged.
- 82e6b25: - Added `'google-vertex'` provider name support to use the `@ai-sdk/google-vertex` provider, the previous `'vertex'` is still supported as an alias, and it is deprecated;
  - Added `'amazon-bedrock'` provider name support to use the `@ai-sdk/amazon-bedrock` provider, the previous `'bedrock'` is still supported as an alias, and it is deprecated;
  - `registerProvider('vertex', …)` and `registerProvider('bedrock', …)` now throw — register under `'google-vertex'` or `'amazon-bedrock'` instead (see the v0.10 → v0.11 migration guide);
  - Fixed a bug causing the wrong model to be used to calculate LLM costs when the model name was referenced by another provider. Cost lookup is now `provider` + `model` against the [models.dev](https://models.dev) catalog, so custom `registerProvider` names that are not models.dev ids correctly get `null` cost instead of an arbitrary provider's rates.

### Patch Changes

- 2caa4a1: - Upgraded `liquidJS` from v10.25.7 to v10.27.2 (`.prompt` files template parser).
- Updated dependencies [46d9d66]
- Updated dependencies [eaf62a3]
- Updated dependencies [a5da6b5]
- Updated dependencies [af37678]
- Updated dependencies [3d1f9bd]
- Updated dependencies [2caa4a1]
- Updated dependencies [be4ec7f]
- Updated dependencies [cbef793]
- Updated dependencies [47f491f]
- Updated dependencies [d815a8e]
  - @outputai/core@0.11.0

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
