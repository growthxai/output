---
name: validate
description: Run lint, build, and tests to validate changes are correct
---

Run the full validation suite from the project root, stopping on first failure:

1. `npm run lint`
2. `npm run build:packages`
3. `npm test`

Report results concisely. If a step fails, show the relevant error output and stop.
