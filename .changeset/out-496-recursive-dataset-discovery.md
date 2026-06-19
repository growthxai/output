---
"@outputai/cli": patch
---

Resolve datasets and evals for nested workflow folders by the workflow's registered name (via the worker catalog), keeping the flat-path lookup as an offline fast path. `output workflow test`, `dataset generate`, and `dataset list` now work for workflows in nested directories (e.g. `src/workflows/a/b/c` registered as `a_b_c`) without a symlink. `output workflow test` also fails fast with an actionable message when a `<wf>_eval` workflow's source exists but didn't compile to `dist`.
