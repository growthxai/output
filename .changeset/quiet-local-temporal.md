---
'@outputai/cli': patch
---

Treat an empty `TEMPORAL_API_KEY` environment variable as unset so local Temporal commands connect over plaintext by default and configured profiles retain their authentication settings.
