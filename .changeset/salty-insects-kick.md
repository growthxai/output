---
"@outputai/credentials": minor
"@outputai/evals": minor
"@outputai/core": minor
"@outputai/http": minor
"@outputai/cli": minor
"@outputai/llm": minor
---

Drop the deprecated `@outputai/output` wrapper package. Projects should install the `@outputai/*` SDK packages they use directly, which avoids hidden transitive "ghost" dependencies.

New scaffolds now declare direct SDK packages, and `output update`, `output migrate`, and `output dev` warn when an existing project still depends on the deprecated wrapper.
