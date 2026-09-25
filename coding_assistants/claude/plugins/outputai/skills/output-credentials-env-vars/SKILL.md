---
name: output-credentials-env-vars
description: "Wire encrypted credentials to environment variables using the credential: convention. Use when setting up LLM provider keys (ANTHROPIC_API_KEY, OPENAI_API_KEY) or any env var that should come from encrypted credentials."
allowed-tools: [Read, Edit, Bash, Glob]
---

# Credentials as Environment Variables

## When to Use This Skill

- Setting up `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` from encrypted credentials
- Wiring any credential path to a `process.env` variable automatically
- Migrating from plaintext `.env` secrets to encrypted credentials
- Understanding why an env var is being resolved at worker startup

## The `credential:` Convention

Any env var whose value starts with `credential:` is resolved from encrypted credentials at worker startup. The format is:

```
ENV_VAR_NAME=credential:<dot.path>
```

### Example `.env`

```bash
# These are resolved automatically from config/credentials.yml.enc
ANTHROPIC_API_KEY=credential:anthropic.api_key
OPENAI_API_KEY=credential:openai.api_key

# Any credential path works
MY_SERVICE_TOKEN=credential:my_service.token
DATABASE_URL=credential:postgres.url
```

### Encrypted credentials (`config/credentials.yml.enc`)

```yaml
anthropic:
  api_key: sk-ant-...        # → resolves ANTHROPIC_API_KEY

openai:
  api_key: sk-...            # → resolves OPENAI_API_KEY

my_service:
  token: tok_live_...        # → resolves MY_SERVICE_TOKEN

postgres:
  url: postgres://...        # → resolves DATABASE_URL
```

## How It Works

When the worker starts, every env var set to `credential:<path>` is replaced with the decrypted value at that path. By the time a workflow runs, `ANTHROPIC_API_KEY` holds the real key and LLM SDKs read it as usual.

## Precedence Rules

Real env var values always take precedence. If `ANTHROPIC_API_KEY` is already set to a non-`credential:` value (e.g. from the shell or a CI secret), it is **never overwritten**:

```bash
# Real value — never replaced
ANTHROPIC_API_KEY=sk-ant-real-override

# Placeholder — gets replaced at startup
ANTHROPIC_API_KEY=credential:anthropic.api_key
```

This means you can override any credential ref at deploy time without changing files.

## Setting Up the Convention

### Step 1: Initialize credentials (if not done)

```bash
npx output credentials init
npx output credentials edit   # Add anthropic.api_key, openai.api_key
```

### Step 2: Update `.env`

```bash
# Replace plaintext secrets with credential references
ANTHROPIC_API_KEY=credential:anthropic.api_key
OPENAI_API_KEY=credential:openai.api_key
```

### Step 3: Verify

Start the worker and look for the log line:

```
[info] Credentials: Resolved credential env vars { vars: [ "ANTHROPIC_API_KEY", "OPENAI_API_KEY" ] }
```

If the log line lists your env vars, credentials are wired correctly.

## Programmatic Access

If you need to call `resolveCredentialRefs()` outside of a worker context:

```typescript
import { resolveCredentialRefs } from '@outputai/core/credentials';

// Returns array of env var names that were resolved
const resolved = resolveCredentialRefs();
console.log('Resolved:', resolved);
// → ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]
```

## Verification Checklist

- [ ] `config/credentials.yml.enc` contains the target credential paths
- [ ] `.env` uses `credential:<path>` values for the relevant env vars
- [ ] Worker startup log shows `Resolved credential env vars` listing the expected env vars
- [ ] First LLM workflow run succeeds (confirming `ANTHROPIC_API_KEY` is set correctly)
- [ ] Setting a real env var in the shell overrides the credential ref

## Related Skills

- `output-credentials-init` — Create the encrypted credentials file
- `output-credentials-edit` — Add/update credential values
- `output-dev-credentials` — Full credentials system reference
