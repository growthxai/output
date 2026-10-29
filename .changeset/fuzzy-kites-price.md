---
"@outputai/core": minor
---

Added per-request context-tier pricing for LLM models, including tier-specific input, output, cache-read and cache-write rates. Applied tiers are exposed on normalized cost items, and multi-step calls are priced separately per provider request.
