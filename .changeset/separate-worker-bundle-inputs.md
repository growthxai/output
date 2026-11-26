---
'@outputai/core': patch
---

Isolate workflow bundle entrypoints and option maps so concurrent workers and bundle checks sharing one SDK install cannot overwrite one another's inputs.
