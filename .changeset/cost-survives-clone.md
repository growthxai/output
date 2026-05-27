---
"@outputai/http": patch
---

Propagate the per-request id across `Response.clone()` so cost emission works from inside ky `afterResponse` hooks. ky clones the response before invoking the hook, which stripped the symbol property `addRequestCost` reads to correlate the request — every hook calling `addRequestCost(response, value)` silently dropped its cost. Patches `clone()` on the original response so each clone re-runs `addRequestIdToResponse`, propagating the tag through any depth of clones. Header-based fallback isn't viable — undici responses are immutable on the received side.
