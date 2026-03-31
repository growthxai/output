---
"@outputai/cli": patch
---

Fix plan and generate CLI commands

- Suppress Claude file writes and next-step suggestions during plan generation (the CLI owns those responsibilities)
- Validate plan file existence before creating workflow skeleton in generate command
- Roll back created skeleton files if workflow build step fails
- Fix empty workflow name in "already exists" error message
