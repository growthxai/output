---
"@outputai/cli": patch
---

Fix scenario loading in `output dev` for workflows whose name differs from their local folder path. For example, a workflow named `writing_editor` stored in `src/workflows/writing/editor` now shows and runs its scenarios correctly.
