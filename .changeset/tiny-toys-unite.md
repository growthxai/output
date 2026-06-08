---
"@outputai/llm": patch
---

Wrap AI SDK `NoObjectGeneratedError` caused by schema validation failures in a new error. This error adds the first validation issue to its `.message`. Example:

```txt
No object generated: response did not match schema. First issue is "Invalid input: expected string, received number" at path [name].
```
