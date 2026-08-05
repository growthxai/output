---
"@outputai/cli": patch
---

- Removed install from hot-reload when developing workflows (`output dev`): nodemon no longer runs `npm install` on every reload, and `package.json` is no longer watched. After dependency changes, run `npm install`, bring the stack down (`output dev down` if it is still running), and start `output dev` again.
- `npm run output:worker` also no longer installs first — run `output:worker:install` (or rely on `output dev`, which still installs on worker start) before build/start. `output:fix` will rewrite `output:worker` in existing projects when you apply it.
