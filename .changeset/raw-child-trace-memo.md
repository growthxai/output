---
"@outputai/core": patch
---

Raw `executeChild` children now inherit the parent's trace context, activity options and search attributes, so they are traced. Values set by the caller in `memo` or `searchAttributes` are kept.
