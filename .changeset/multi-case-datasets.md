---
"@outputai/evals": minor
---

Switch dataset files to multi-case format where each top-level YAML key is the case name. Allows grouping multiple test cases into a single file instead of one file per case.

The old single-case format (with a top-level `name:` field) is no longer supported — existing files must be migrated to the new format. Treated as minor rather than major because adoption is still early and the migration is mechanical.
