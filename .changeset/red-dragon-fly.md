---
"@outputai/core": minor
---

## Global proxy

- Removed Core worker’s automatic global Undici proxy setup. Starting a worker no longer calls `setGlobalDispatcher()` when proxy environment variables are detected. `@outputai/http` and `@outputai/llm` continue configuring their own proxy-aware dispatchers.
  - This affects direct and third-party Fetch/Undici calls that relied on Core’s global dispatcher; calls through @outputai/http or @outputai/llm retain proxy support.
