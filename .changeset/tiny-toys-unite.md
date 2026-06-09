---
"@outputai/llm": patch
---

Recreate AI SDK `NoObjectGeneratedError` schema validation failures as new `NoObjectGeneratedError` instances with a clearer message:

```txt
No object generated: response did not match schema. First issue is "Invalid input: expected string, received number" at path [name].
```
