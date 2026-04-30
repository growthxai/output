---
"@outputai/credentials": patch
"@outputai/cli": patch
---
Improve encrypted credentials loading: add clearer errors when keys are missing or invalid and ensure the CLI exits gracefully instead of printing stack traces.
