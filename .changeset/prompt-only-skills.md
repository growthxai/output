---
"@outputai/llm": minor
---

- Removed skills definition other than in the prompt file:
  - Removed the `skills` argument from `generateText()`, `streamText()`, `generateTextWithStreaming()`, and `Agent`.
  - Removed the `skills/` auto-discovery.
  - Removed the `skill()` helper and the `SkillsArg` type.
- Removed native AI SDK call arguments from `generateText()`, `generateTextWithStreaming()`, `streamText()`, `generateImage()`, and `Agent`. Also removed `skills` and `maxSteps`. These are the supported arguments:
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
- Fixed call-argument tools overriding prompt tools. They now merge (caller wins on the same key; `load_skill` is last). Prompt-only native tools now use `stopWhen: stepCountIs(maxSteps)` from the prompt (default 10).
- Updated prompt shape:
  - Renamed `Prompt.promptFileDir` to `Prompt.fileDir`.
  - Added `Prompt.variables` (`Record<string, string | number | boolean>`, default `{}`).
  - Updated `Prompt.config.skills` to always be a `string[]` after load (required on the public type).
  - Added `Prompt.config.maxSteps` (positive integer, default 10). It replaces the old argument and is required on the public type.
  - Updated `Prompt.instructions` to always be `string | null` after load (chat prompts are `null`).
  - Removed `PromptMessage.attributes`. `options="<name>"` on a role tag is resolved at `loadPrompt` against `config.messageOptions` into optional per-message `providerOptions`. Unknown role-tag attributes throw at load.
- Fixed nested role tags inside a message closing the outer tag. Nested tags are treated as content.
- Updated prompt file `config` to be strict. Unknown top-level keys throw.
- Updated LLM traces on `generateText()`, `streamText()`, `generateTextWithStreaming()`, `generateImage()`, and `Agent`:
  - Updated start `input` to `{ prompt }` (the loaded object). Removed the v0.11 filename `prompt`, sibling `variables`, and `loadedPrompt`.
  - Added `cost` on end `output` (also still a trace attribute and `cost:llm:request` when present).
  - Renamed `sourcesFromTools` to `sources` (merged tool + provider sources).
  - Fixed source merge dropping provider document sources that have `id` but no `url`.
  - Updated `ExtractedSource` to the AI SDK `generateText` sources item type (url and document).
- Updated Agent message store:
  - Renamed `conversationStore` to `messageStore` and `ConversationStore` to `MessageStore`.
  - Removed `createMemoryConversationStore()`. The caller supplies a `MessageStore` (`getMessages` / `addMessages`).
  - Fixed `Agent.stream()` to persist to `messageStore` when `finishReason` is not `'error'`.
- Updated `LLMCallCost` and `LLMUsageEvent` to the `Tracing.Attribute.LLMUsage` instance type from `@outputai/core`. `response.cost` and stream `onFinish` `cost` are that instance, or `null` when pricing is missing.
- Added Agent constructor validation matching the text APIs (`Invalid Agent() arguments`).
- Renamed the AI SDK namespace re-export from `ai` to `aiSdk` (both code and types).
- Removed named AI SDK re-exports (`tool`, `Output`, `smoothStream`, `stepCountIs`, `hasToolCall`, `jsonSchema`) and AI SDK type re-exports (`ToolSet`, `FinishReason`, `ModelMessage`, and others). Use the `aiSdk` namespace (or import from `ai`) for those.
