---
"@outputai/core": minor
---

- `workflow()`, `step()`, and `evaluator()` now pass the value returned by the Zod `inputSchema` parser to their handler. Workflows and steps also return the value produced by their `outputSchema` parser. Zod transforms, coercions, defaults, and object-key stripping therefore affect the values handled and returned by these components instead of only validating them.
