---
"@outputai/http": patch
---

- Added a custom dispatcher that disables HTTP/2 (`allowH2: false`) when using exported `fetch`.

- Added support for `dispatcher` in the init argument of `fetch`; it has precedence over the custom dispatcher.

