---
"@outputai/cli": patch
---

- Removed install step from hot-reload when developing workflows (`output dev`). Nodemon (hot-reload daemon) re-installs (`npm install`) the dependencies on every reload, which is slow, even with cache. Also remove package.json from watched files.

- Changed `npm install` to `npm ci`. After scaffolding, when the projects runs, it already has a lock file, so full install isn't necessary. This increases speed and predictability on dependencies resolution.
