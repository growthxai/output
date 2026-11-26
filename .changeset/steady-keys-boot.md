---
"@outputai/core": minor
---

Load and cache global credentials at worker boot through the same path as later reads, so a missing, wrong, or malformed decryption key fails startup when the credentials file exists. Deploys that ship that encrypted file without a valid key will crash-loop after upgrade - see the v0.18.0 → v0.19.0 migration guide.
