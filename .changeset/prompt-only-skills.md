---
"@outputai/llm": minor
---

- Removed the `skills` argument from `generateText()`, `streamText()`, `generateTextWithStreaming()`, and `Agent`. Removed `skill()`, colocated `skills/` auto-discovery, and the `SkillsArg` type. Skills load only from prompt frontmatter.
- Dropped native AI SDK call arguments from `generateText()`, `generateTextWithStreaming()`, `streamText()`, `generateImage()`, and `Agent`. Calls no longer accept `temperature`, `maxTokens`, `maxSteps`, `providerOptions`, image `n`/`size`/`seed`, `experimental_transform`, `onStepFinish`, and similar. Set model and image config (including `maxSteps`, default 10) on the prompt file; call-argument `stopWhen` still overrides it.

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
- Fixed prompt YAML tools and call-argument tools to merge (caller wins on the same key; `load_skill` is last). Prompt-only native tools now use `stopWhen: stepCountIs(maxSteps)` from the prompt (default 10).
- Renamed `Prompt.promptFileDir` to `Prompt.fileDir`. Loaded `Prompt` includes `variables` (`Record<string, string | number | boolean>`, default `{}`). `Prompt.config.skills` is always a `string[]` after load.
- Prompt file `config` is strict. Unknown top-level keys throw. Snake_case aliases of known fields (`max_tokens`) include a suggestion (`use "maxTokens"`). Provider-specific keys (`effort`, `reasoningEffort`, `topP`) belong under `providerOptions`, which stays open.
- LLM traces on `generateText()`, `streamText()`, `generateTextWithStreaming()`, `generateImage()`, and `Agent`: start `input` is `{ prompt }` only (loaded object with `name`, `fileDir`, `variables`, rendered `config`/`messages`; replaces v0.11 filename `prompt`, sibling `variables`, and `loadedPrompt`). End `output` includes `cost` (also still a trace attribute and `cost:llm:request` when present) and merged `sources` (replaces `sourcesFromTools`).
- Renamed Agent `conversationStore` to `messageStore` and the `ConversationStore` type to `MessageStore`. Removed `createMemoryConversationStore()`. Multi-turn history uses a `MessageStore` (`getMessages` / `addMessages`) supplied by the caller.
- Added Agent constructor validation matching the text APIs (`Invalid Agent() arguments`).
- Removed named AI SDK re-exports (`tool`, `Output`, `smoothStream`, `stepCountIs`, `hasToolCall`, `jsonSchema`) and cherry-picked AI SDK type re-exports (`ToolSet`, `FinishReason`, `ModelMessage`, and others). Use the `aiSdk` namespace (or import from `ai`) for those. Renamed the namespace re-export `ai` to `aiSdk`.
