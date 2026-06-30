---
"@outputai/llm": patch
---

- Disabled HTTP/2 (`allowH2: false`) in the dispatcher of the fetch client used when consuming the AI SDK.

- Fixed an issue where a proxy dispatcher (`EnvHttpProxyAgent`) was not being properly used when proxy environment variables were set.

