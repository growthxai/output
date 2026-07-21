---
"@outputai/llm": minor
---

Added stricter LiquidJs settings for prompt files parsing. The following configurations were added:
```js
{
  strictFilters: true,
  strictVariables: true,
  lenientIf: true
}
```
