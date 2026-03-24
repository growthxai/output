---
"@outputai/cli": patch
---

Use encrypted credentials in `output init` scaffold by default. API keys are now stored in `config/credentials.yml.enc` instead of `.env`, and `<SECRET>` markers are renamed to `<FILL_ME_OUT>`.
