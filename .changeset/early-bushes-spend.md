---
"@outputai/llm": patch
---

Added a static subset of the models pricing table, so costs for the six shipped providers can be calculated even when the live models pricing provider is down.

- Added `pricingFreshness` to `LLMGenerationCost`, reporting whether the rates were fetched during the call (`live`), served from the 24 hour cache (`cached`), kept past that cache's expiry because a refresh failed (`stale`), or read from the bundled snapshot (`snapshot`).
- Changed `LLMGenerationCost.status` to `imprecise` when rates come from the bundled snapshot, since it is a point-in-time copy that can lag the live catalog by an unbounded amount. A stale cache does not downgrade the status, because those rates were accurate when they were fetched.
- Changed pricing lookups to pause live requests for 10 minutes after a failure, instead of retrying the unreachable catalog on every call.
