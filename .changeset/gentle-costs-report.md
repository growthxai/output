---
"@outputai/cli": minor
---

Updated `output workflow cost` to read the normalized `llm:generation:cost` and `llm:generation:usage` trace attributes while retaining support for legacy `llm:usage` traces. Cost overrides now reprice cache-read, cache-write, text, and reasoning usage, and model prefix matching selects the most specific configured price.
