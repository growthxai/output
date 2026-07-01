---
"@outputai/core": patch
---

- Disabled HTTP/2 (`allowH2: false`) in the global fetch dispatcher configured by `setGlobalDispatcher` when proxy env vars are detected;
- Disabled HTTP/2 (`allowH2: false`) in the webhook functions `sendHttpRequest` and `sendPostRequestAndAwaitWebhook` by using a dispatcher (`EnvHttpProxyAgent`).
