---
"@outputai/core": minor
---

Removed the optional `executionTimeMs` field from `LastOutput` and `LastEval`, and from `LastOutputSchema` and `LastEvalSchema`, in `@outputai/core/evals`. Nothing read it. Dataset files that still contain it load without error, because the schemas ignore unknown keys. TypeScript code that sets the field on a `LastOutput` or `LastEval` must drop it, since it is now an unknown property.
