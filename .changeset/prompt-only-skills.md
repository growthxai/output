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
  | `conversationStore` | optional | - | - | - |
  | `messages` | - | optional | optional | optional |
  | `abortSignal` | - | optional | optional | optional |
  | `toolChoice` | - | optional | optional | optional |
  | `onChunk` | - | - | optional | optional |
  | `onFinish` | - | - | - | optional |
  | `onError` | - | - | - | optional |
- Fixed prompt YAML tools and call-argument tools to merge (caller wins on the same key; `load_skill` is last). Prompt-only native tools now use `stopWhen: stepCountIs(maxSteps)` from the prompt (default 10).
- Renamed `Prompt.promptFileDir` to `Prompt.fileDir`. `Prompt.config.skills` is always a `string[]` after load.
- Renamed LLM start-trace details `prompt` (filename) to `promptFile` and `loadedPrompt` to `prompt` (loaded object) on `generateText()`, `streamText()`, `generateTextWithStreaming()`, `generateImage()`, and `Agent`. Agent traces now also include `variables` and the loaded `prompt`.
- Added Agent constructor validation matching the text APIs (`Invalid Agent() arguments`).
- Removed named AI SDK re-exports (`tool`, `Output`, `smoothStream`, `stepCountIs`, `hasToolCall`, `jsonSchema`) and cherry-picked AI SDK type re-exports (`ToolSet`, `FinishReason`, `ModelMessage`, and others). Use the `aiSdk` namespace (or import from `ai`) for those. Renamed the namespace re-export `ai` to `aiSdk`.
