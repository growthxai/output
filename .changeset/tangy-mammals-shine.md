---
"@outputai/llm": patch
---

- Disabled HTTP/2 (`allowH2: false`) in the dispatcher of the fetch client used when consuming the AI SDK and fetching model pricing;
- Replaced the `Agent` dispatcher in favor of `EnvHttpProxyAgent` to respect the proxy env vars. [OUT-506].
