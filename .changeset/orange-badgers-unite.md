---
"@outputai/llm": patch
---

Prevent template variables from injecting message blocks into rendered prompts. Variable content containing tag-shaped substrings (e.g. `</user>` or `<system>...</system>`, common when evaluating webpages or chat transcripts) was being tokenized by `parsePrompt` as real message blocks, producing duplicate `system` messages that providers like Anthropic reject. `loadPrompt` now arms every `{{ ... }}` interpolation with an internal escape filter so variable output stays inert at parse time.
