---
"@outputai/cli": patch
---

- Removed install step from hot-reload when developing workflows (`output dev`). Nodemon (hot-reload daemon) re-installs (`npm install`) the dependencies on every reload, which is slow, even with cache. Also remove package.json from watched files.
