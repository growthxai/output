---
"@outputai/evals": major
---

Switch dataset files to multi-case format where each top-level YAML key is the case name. Allows grouping multiple test cases into a single file. The old single-case format with a top-level `name:` field is no longer supported — existing files must be migrated.
