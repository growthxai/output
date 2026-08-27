---
"@outputai/llm": minor
---

## Skills

- Fixed implicit and inconsistent skill loading by making prompt frontmatter the only skills definition:
  - Removed the `skills` argument from `generateText()`, `streamText()`, `generateTextWithStreaming()`, and `Agent`.
  - Removed the `skills/` auto-discovery.
  - Removed the `skill()` helper and the `Skill` and `SkillsArg` types.
  - Fixed configured skill directories silently omitting Markdown files in nested folders. Directory loading is recursive and sorted.
  - Fixed skill discovery following symbolic links. Symbolic links are ignored.

## Call signatures and validation

- Fixed unrestricted native AI SDK call arguments bypassing validation and overriding prompt-owned model/configuration. Generation and Agent APIs now reject unsupported or misplaced arguments before provider I/O. Removed native AI SDK call arguments from `generateText()`, `generateTextWithStreaming()`, `streamText()`, `generateImage()`, and `Agent`, as well as `skills` and `maxSteps`. These are the supported arguments:
  | Argument | `generateText` | `generateTextWithStreaming` | `streamText` | `generateImage` |
  |----------|----------------|-----------------------------|--------------|-----------------|
  | `prompt` | required | required | required | required |
  | `promptDir` | optional | optional | optional | optional |
  | `variables` | optional | optional | optional | optional |
  | `tools` | optional | optional | optional | - |
  | `output` | optional | optional | optional | - |
  | `toolChoice` | optional | optional | optional | - |
  | `stopWhen` | optional | optional | optional | - |
  | `abortSignal` | optional | optional | optional | optional |
  | `onChunk` | - | optional | optional | - |
  | `onFinish` | - | - | optional | - |
  | `onError` | - | - | optional | - |
  | `images` | - | - | - | optional |
  | `mask` | - | - | - | optional |

  | Argument | `new Agent` | `.generate` | `.generateWithStreaming` | `.stream` |
  |----------|-------------|--------------------------|-----------|-----------|
  | `prompt` | required | - | - | - |
  | `promptDir` | optional | - | - | - |
  | `variables` | optional | - | - | - |
  | `tools` | optional | - | - | - |
  | `output` | optional | - | - | - |
  | `stopWhen` | optional | - | - | - |
  | `messageStore` | optional | - | - | - |
  | `messages` | - | optional | optional | optional |
  | `abortSignal` | - | optional | optional | optional |
  | `toolChoice` | - | optional | optional | optional |
  | `onChunk` | - | - | optional | optional |
  | `onFinish` | - | - | - | optional |
  | `onError` | - | - | - | optional |
  - Fixed callers being able to replace the prompt model while traces and cost used the prompt provider/model.
  - Fixed unsupported callbacks on completion APIs being silently overwritten by internal callbacks.
  - Fixed Agent using AI SDK's two automatic retries while other Output generation APIs disabled them. Agent now uses `maxRetries: 0`.
  - Added the public `GenerateImageInput` type for `generateImage()` `images` and `mask` values.
- Fixed invalid Agent constructor and method arguments being forwarded for late failure by validating messages, callbacks, tool choices, and `MessageStore` implementations at the public boundary.

## Tools and tool loops

- Fixed tool handling:
  - Fixed call-argument tools overriding prompt tools. They now merge (caller wins on the same key; `load_skill` is last).
  - Fixed prompt-only native tools missing the tool-loop limit. They now use `stopWhen: stepCountIs(maxSteps)` from the prompt (default 10).
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
  - Deprecated `maxTokens` in favor of `maxOutputTokens`; both must be positive integers.

## Streaming and Agent message store

- Fixed stream observer failures escaping or disappearing silently. `streamText()` and `Agent.stream()` `onError` and `onFinish` callbacks are fire-and-forget observers. Output maps and forwards provider errors, and logs and ignores observer exceptions and rejected promises.
- Updated Agent message store:
  - Renamed `conversationStore` to `messageStore` and `ConversationStore` to `MessageStore`.
  - Removed `createMemoryConversationStore()`. The caller supplies a `MessageStore` (`getMessages` / `addMessages`).
  - Fixed `Agent.stream()` to persist to `messageStore` when `finishReason` is not `'error'`.
  - Fixed stream message-store failures suppressing the user `onFinish`. Failures are logged and stream finalization continues.
  - Fixed Agent store failures producing success-then-error trace sequences. Store persistence completes before a successful trace end.

## Tracing, sources, and response types

- Fixed inconsistent and incomplete LLM trace payloads across `generateText()`, `streamText()`, `generateTextWithStreaming()`, `generateImage()`, and `Agent`:
  - Updated start `input` to `{ prompt }` (the loaded object). Removed the v0.11 filename `prompt`, sibling `variables`, and `loadedPrompt`.
  - Added `cost` on end `output` (also still a trace attribute and `cost:llm:request` when present).
  - Renamed `sourcesFromTools` to `sources` (merged tool + provider sources).
  - Fixed source merge dropping provider document sources that have `id` but no `url`.
  - Fixed blank or untrimmed search URLs producing invalid citations or unstable source IDs. URLs are trimmed and blank values are dropped.
  - Fixed wrapped text responses not consistently exposing `sources` as an array.
  - Updated `ExtractedSource` to the AI SDK `generateText` sources item type (url and document).
- Fixed public cost, source, and stream callback types not matching wrapped runtime values. `LLMCallCost` and `LLMUsageEvent` are the `Tracing.Attribute.LLMUsage` instance type from `@outputai/core`; `response.cost` and stream `onFinish` `cost` are that instance, or `null` when pricing is missing. Stream `onFinish` types also include wrapped `result` and merged `sources`.

## AI SDK exports and public parameter types

- Renamed the AI SDK namespace re-export from `ai` to `aiSdk` (both code and types).
- Removed named AI SDK re-exports (`tool`, `Output`, `smoothStream`, `stepCountIs`, `hasToolCall`, `jsonSchema`) and AI SDK type re-exports (`ToolSet`, `FinishReason`, `ModelMessage`, and others). Use the `aiSdk` namespace (or import from `ai`) for those.
- Removed the Output-owned `GenerateTextAiSdkOptions`, `StreamTextAiSdkOptions`, and `GenerateImageAiSdkOptions` aliases. Use `GenerateTextParameters`, `StreamTextParameters`, and `GenerateImageParameters`.
- Updated `OutputAgentGenerateWithStreamingParameters` to no longer accept an output type argument.
