---
"@outputai/cli": patch
---

CLI env loading now uses Node's `process.loadEnvFile` instead of the `dotenv` package.
