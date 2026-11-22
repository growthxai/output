---
"@outputai/core": minor
---

Fail worker boot with `MissingKeyError` when the credentials file the worker would load (`config/credentials/<NODE_ENV>.yml.enc`, or else `config/credentials.yml.enc`) exists but neither the matching env var nor key file supplies a decryption key. Deploys that ship that encrypted file without the key will crash-loop after upgrade - see the v0.18.0 → v0.19.0 migration guide.
