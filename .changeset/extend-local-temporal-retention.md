---
"@outputai/cli": patch
---

Bump default local Temporal namespace retention from 24h to 720h (30 days) so workflow runs aren't garbage-collected within a day during local development.
