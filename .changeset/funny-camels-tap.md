---
"output-api": patch
---

Added new `/ready` endpoint to report if API is ready to answer to requests.

Added Temporal connection monitoring. When unhealthy, `/ready` return 503; if lost the API shuts down.
