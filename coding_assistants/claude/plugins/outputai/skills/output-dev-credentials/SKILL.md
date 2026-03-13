---
name: output-dev-credentials
description: Store and reference encrypted secrets in Output SDK workflows using @outputai/credentials. Use when integrating API keys, database passwords, or third-party tokens.
allowed-tools: [Read, Write, Edit, Bash, Glob]
---

# Encrypted Credentials Management

## Overview

The `@outputai/credentials` package provides encrypted secrets management for Output SDK workflows. It replaces `process.env` patterns with a structured, encrypted YAML-based system that supports scoped credentials with deep merging.

## When to Use This Skill

- Adding API keys or tokens to a workflow
- Migrating from `process.env` to encrypted credentials
- Setting up per-workflow or per-environment secrets
- Debugging missing credential errors (`MissingCredentialError`, `MissingKeyError`)
- Configuring custom credential providers (Vault, AWS Secrets Manager)

## Library API

### Import

```typescript
import { credentials } from '@outputai/credentials';
```

### `credentials.get(path, defaultValue?)`

Safe read with optional default. Never throws.

```typescript
// Returns value or undefined
const region = credentials.get('aws.region');

// Returns value or default
const region = credentials.get('aws.region', 'us-east-1');
```

### `credentials.require(path)`

Strict read. Throws `MissingCredentialError` if not found.

```typescript
const apiKey = credentials.require('anthropic.api_key');
```

### Error Types

```typescript
import { MissingCredentialError, MissingKeyError } from '@outputai/credentials';
```

| Error | Thrown When | Fix |
|-------|------------|-----|
| `MissingCredentialError` | `credentials.require()` path not found | Add the credential via `output credentials edit` |
| `MissingKeyError` | No decryption key available | Set `OUTPUT_CREDENTIALS_KEY` env var or create `.key` file |

## CLI Commands

```bash
# Initialize credentials (generates key + encrypted YAML template)
output credentials init                              # Global
output credentials init -e production                 # Environment-specific
output credentials init -w payment_processing         # Workflow-specific

# Edit credentials (decrypts, opens $EDITOR, re-encrypts on save)
output credentials edit                               # Global
output credentials edit -e production                  # Environment
output credentials edit -w payment_processing          # Workflow

# Show decrypted credentials (debugging)
output credentials show                               # Global
output credentials show -e development                 # Environment

# Get single credential value
output credentials get anthropic.api_key               # Global
output credentials get stripe.key -w payment_processing # Workflow
```

**Flags:**
- `-e` / `--environment`: Target environment (production, development)
- `-w` / `--workflow`: Target a specific workflow
- `-f` / `--force`: Overwrite existing credentials (init only)
- Note: `-e` and `-w` are mutually exclusive

## Three-Tier Scope System

### 1. Global Credentials

```
config/credentials.yml.enc    # Encrypted YAML
config/credentials.key        # Decryption key (DO NOT COMMIT)
```

Key env var: `OUTPUT_CREDENTIALS_KEY`

### 2. Environment-Specific Credentials

```
config/credentials/production.yml.enc
config/credentials/production.key
```

Key env var: `OUTPUT_CREDENTIALS_KEY_PRODUCTION`

### 3. Per-Workflow Credentials

```
src/workflows/{name}/credentials.yml.enc
src/workflows/{name}/credentials.key
```

Key env var: `OUTPUT_CREDENTIALS_KEY_{WORKFLOW_NAME}` (uppercased)

## Key Resolution Chain

For each scope, the key is resolved in order:

1. **Environment variable** (`OUTPUT_CREDENTIALS_KEY`, `OUTPUT_CREDENTIALS_KEY_{ENV}`, or `OUTPUT_CREDENTIALS_KEY_{WORKFLOW}`)
2. **Key file** on disk (e.g., `config/credentials.key`)
3. **Throws `MissingKeyError`** if neither found

Workflow credentials fall back to the global key if no workflow-specific key exists.

## Credential Merging

When a workflow has its own credentials, they deep-merge over global credentials. Workflow values win at the same path:

```yaml
# Global (config/credentials.yml.enc)
anthropic:
  api_key: sk-ant-global
aws:
  region: us-east-1

# Workflow (src/workflows/my_workflow/credentials.yml.enc)
anthropic:
  api_key: sk-ant-workflow-specific
stripe:
  secret_key: sk_live_workflow

# Merged result at runtime:
# anthropic.api_key  -> sk-ant-workflow-specific  (overridden by workflow)
# aws.region         -> us-east-1                 (from global)
# stripe.secret_key  -> sk_live_workflow           (added by workflow)
```

## Migration from `process.env`

### Before (old pattern)

```typescript
import { httpClient } from '@outputai/http';

const API_KEY = process.env.SERVICE_API_KEY || '';

const client = httpClient({
  prefixUrl: 'https://api.service.com',
  headers: { Authorization: `Bearer ${API_KEY}` }
});
```

### After (credentials pattern)

```typescript
import { httpClient } from '@outputai/http';
import { credentials } from '@outputai/credentials';

const apiKey = credentials.require('service.api_key');

const client = httpClient({
  prefixUrl: 'https://api.service.com',
  headers: { Authorization: `Bearer ${apiKey}` }
});
```

### Migration Steps

1. Run `output credentials init` to create the encrypted file and key
2. Run `output credentials edit` to add your secrets
3. Replace `process.env.X` reads with `credentials.require('x')` or `credentials.get('x', default)`
4. Remove environment variables from `.env` files
5. Add `*.key` to `.gitignore`

## Custom Providers

Replace the default encrypted YAML backend with Vault, AWS Secrets Manager, etc.:

```typescript
import { setProvider } from '@outputai/credentials';

setProvider({
  loadGlobal: ({ environment }) => {
    return fetchFromVault(`credentials/${environment || 'default'}`);
  },
  loadForWorkflow: ({ workflowName, environment }) => {
    return fetchFromVault(`workflows/${workflowName}`) ?? null;
  }
});
```

### Provider Interface

```typescript
interface CredentialsProvider {
  loadGlobal(context: { environment: string | undefined }): Record<string, unknown>;
  loadForWorkflow(context: {
    workflowName: string;
    workflowDir: string | undefined;
    environment?: string | undefined;
  }): Record<string, unknown> | null;
}
```

## Security Considerations

- **Never commit `.key` files** - Add `*.key` to `.gitignore`
- **Safe to commit `.yml.enc` files** - Cannot be read without the key
- **Key file permissions** - Created with mode `0o600` (owner-only read/write)
- **Temp file cleanup** - Plaintext overwritten with null bytes before deletion during `edit`
- **Use env vars in CI/CD** - Set `OUTPUT_CREDENTIALS_KEY` in your pipeline
- **Encryption** - AES-256-GCM with unique random nonce per encryption

## Verification Checklist

- [ ] `credentials` imported from `@outputai/credentials`
- [ ] `credentials.require()` used for mandatory secrets (not `process.env`)
- [ ] `credentials.get()` used with default for optional values
- [ ] `*.key` listed in `.gitignore`
- [ ] Credentials initialized via `output credentials init`
- [ ] Secrets added via `output credentials edit`

## Related Skills

- `output-dev-http-client-create` - Creating HTTP clients that use credentials
- `output-dev-step-function` - Using credentials in step functions
- `output-error-http-client` - Troubleshooting HTTP client issues
