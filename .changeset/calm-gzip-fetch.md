---
"@outputai/core": patch
"@outputai/llm": patch
"@outputai/cli": patch
---

Reverted `undici` from 8.11.0 to 8.10.2. Version 8.11.0 made Node's built-in `fetch` negotiate HTTP/2 when `undici` is imported, which returned gzip response bodies undecoded (`content-encoding` null) and broke callers using plain `fetch`, such as AI SDK providers without a custom fetch.
