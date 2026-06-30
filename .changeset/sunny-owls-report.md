---
"@outputai/core": patch
---

- Disabled HTTP/2 (`allowH2: false`) in the global fetch dispatcher configured by `setGlobalDispatcher` when using proxies.

- Disabled HTTP/2 (`allowH2: false`) in the fetch used by the exported methods `sendHttpRequest` and `sendPostRequestAndAwaitWebhook`.
