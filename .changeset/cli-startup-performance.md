---
"@outputai/cli": patch
---

Faster CLI startup: ship `oclif.manifest.json` in the published package so only the invoked command module is loaded (instead of importing every command on every invocation), move the update check off the critical path (the init hook now only reads the local cache and refreshes it via a detached background process with a 5s registry timeout, instead of awaiting an unbounded `npm view` subprocess), and load `undici` only when a proxy env var is configured.
