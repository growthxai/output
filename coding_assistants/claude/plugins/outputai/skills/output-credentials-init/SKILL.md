---
name: output-credentials-init
description: Initialize encrypted credentials for an Output.ai project. Use when setting up credentials for the first time, adding environment-specific credentials, or adding per-workflow credentials.
allowed-tools: [Read, Bash, Glob]
---

# Initializing Credentials

## When to Use This Skill

- First time setting up credentials for a project
- Adding production/staging environment-specific credentials
- Adding per-workflow credentials that override global ones
- Re-initializing credentials after losing a key file

## Overview

The `npx output credentials init` command generates two files:
- A **key file** (`.key`) — the decryption secret. **Never commit this.**
- An **encrypted YAML file** (`.yml.enc`) — the credentials store. Safe to commit.

## Commands

```bash
# Global credentials (most common)
npx output credentials init

# Environment-specific
npx output credentials init -e production
npx output credentials init -e staging

# Per-workflow credentials (overrides globals for that workflow)
npx output credentials init -w my_workflow

# Force overwrite existing files
npx output credentials init --force
```

## What Gets Created

### Global (default)

```
config/
├── credentials.key        ← Add to .gitignore
└── credentials.yml.enc    ← Safe to commit
```

### Environment-specific

```
config/credentials/
├── production.key         ← Add to .gitignore
└── production.yml.enc     ← Safe to commit
```

### Per-workflow

```
src/workflows/{name}/
├── credentials.key        ← Add to .gitignore
└── credentials.yml.enc    ← Safe to commit
```

## Default Template

After init, the encrypted YAML contains this template:

```yaml
anthropic:
  api_key: ""
openai:
  api_key: ""
_env:
  ANTHROPIC_API_KEY: anthropic.api_key
  OPENAI_API_KEY: openai.api_key
```

The `_env` section wires credentials to environment variables automatically at worker startup. See `output-credentials-env-vars` for details.

## After Init: Add Your Secrets

```bash
npx output credentials edit          # Opens $EDITOR with decrypted YAML
```

Fill in the empty values, save, and close. The file is re-encrypted automatically.

## Gitignore Setup

```bash
echo "*.key" >> .gitignore
echo "config/credentials.key" >> .gitignore
```

Or add to your `.gitignore`:

```
# Credentials decryption keys — never commit
*.key
config/credentials.key
config/credentials/*.key
src/workflows/*/credentials.key
```

## CI/CD: Key Distribution

In CI/CD pipelines, pass the key as an environment variable instead of committing the file:

```bash
# Set in your CI/CD environment
OUTPUT_CREDENTIALS_KEY=<key-value>

# Environment-specific
OUTPUT_CREDENTIALS_KEY_PRODUCTION=<key-value>

# Per-workflow
OUTPUT_CREDENTIALS_KEY_MY_WORKFLOW=<key-value>
```

The key value is the contents of the `.key` file.

## Verification Checklist

- [ ] `config/credentials.key` created (or env-specific variant)
- [ ] `config/credentials.yml.enc` created
- [ ] `.key` files added to `.gitignore`
- [ ] `npx output credentials edit` run to fill in secret values
- [ ] `npx output credentials show` verifies decryption works

## Related Skills

- `output-credentials-edit` — Fill in and manage credential values
- `output-credentials-env-vars` — Wire credentials to environment variables
- `output-dev-credentials` — Full credentials system reference
