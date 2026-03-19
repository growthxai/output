---
name: output-credentials-edit
description: View and edit encrypted credentials in an Output.ai project. Use when adding secrets, updating API keys, verifying credential values, or retrieving a specific credential.
allowed-tools: [Read, Bash, Glob]
---

# Viewing and Editing Credentials

## When to Use This Skill

- Adding or updating API keys and secrets
- Verifying what credentials are currently stored
- Retrieving a specific credential value
- Checking credential structure before referencing in code

## Commands

### Edit (Opens `$EDITOR`)

```bash
# Edit global credentials
npx output credentials edit

# Edit environment-specific
npx output credentials edit -e production
npx output credentials edit -e staging

# Edit per-workflow credentials
npx output credentials edit -w my_workflow
```

The file is decrypted to a temp file, opened in `$EDITOR`, then re-encrypted on save. The temp file is securely wiped (overwritten with null bytes) after closing.

### Show (Print to stdout)

```bash
# Show global credentials (plaintext — use carefully)
npx output credentials show

# Show environment-specific
npx output credentials show -e production

# Show per-workflow
npx output credentials show -w my_workflow
```

### Get (Single value)

```bash
# Get a single credential by dot-notation path
npx output credentials get anthropic.api_key
npx output credentials get aws.region
npx output credentials get stripe.secret_key -w payment_processing
```

Returns the raw string value (or JSON for nested objects).

## YAML Format

Credentials are stored as structured YAML with dot-notation access:

```yaml
anthropic:
  api_key: sk-ant-...

openai:
  api_key: sk-...

aws:
  region: us-east-1
  access_key_id: AKIA...
  secret_access_key: ...

stripe:
  secret_key: sk_live_...
  webhook_secret: whsec_...

_env:
  ANTHROPIC_API_KEY: anthropic.api_key
  OPENAI_API_KEY: openai.api_key
```

The `_env` section maps credential paths to environment variables. See `output-credentials-env-vars`.

## Accessing Credentials in Code

```typescript
import { credentials } from '@outputai/credentials';

// Safe read — returns undefined if not found
const region = credentials.get('aws.region');

// Read with default
const region = credentials.get('aws.region', 'us-east-1');

// Strict read — throws MissingCredentialError if not found
const apiKey = credentials.require('anthropic.api_key');
```

## Credential Merging

Per-workflow credentials deep-merge over global credentials at runtime. Workflow values take precedence:

```yaml
# Global: anthropic.api_key = "sk-ant-global"
# Workflow: anthropic.api_key = "sk-ant-workflow"
# Runtime result: credentials.get('anthropic.api_key') → "sk-ant-workflow"
```

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `MissingKeyError` | Key file not found and env var not set | Run `output credentials init` or set `OUTPUT_CREDENTIALS_KEY` |
| `MissingCredentialError` | Path not found in credentials | Run `npx output credentials edit` and add the value |
| `aes/gcm: invalid ghash tag` | Key doesn't match encrypted file | Key and `.yml.enc` are out of sync — re-init or use correct key |

## Verification Checklist

- [ ] `npx output credentials show` prints expected values
- [ ] `npx output credentials get anthropic.api_key` returns the correct key
- [ ] No empty string values remain for required secrets
- [ ] Per-workflow credentials merge correctly with global

## Related Skills

- `output-credentials-init` — Create credentials files for the first time
- `output-credentials-env-vars` — Automatically wire credentials to env vars
- `output-dev-credentials` — Full credentials system reference
