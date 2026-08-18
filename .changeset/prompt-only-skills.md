---
"@outputai/llm": minor
---

- Removed the `skills` argument from `generateText()`, `streamText()`, `generateTextWithStreaming()`, and `Agent`. Removed `skill()`, colocated `skills/` auto-discovery, and the `SkillsArg` type. Skills load only from prompt frontmatter.
- Fixed prompt YAML tools and call-argument tools to merge (caller wins on the same key; `load_skill` is last). Prompt-only native tools now use `stopWhen: stepCountIs(maxSteps)` (default 10).
- Renamed `Prompt.promptFileDir` to `Prompt.fileDir`. `Prompt.config.skills` is always a `string[]` after load.
- Added Agent constructor validation matching the text APIs (`Invalid Agent() arguments`).
