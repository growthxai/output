---
name: output-error-zod-import
description: Fix Zod schema import issues in Output SDK workflows. Use when seeing "incompatible schema" errors, type errors at step boundaries, schema validation failures, or when schemas don't match between steps.
allowed-tools: [Bash, Read]
---

# Fix Zod Import Source Issues

## Overview

This skill helps diagnose and fix a common issue where Zod schemas are imported from the wrong source. Output SDK requires schemas to be imported from `@output.ai/core`, not directly from `zod`.

## When to Use This Skill

You're seeing:
- "incompatible schema" errors
- Type errors at step boundaries
- Schema validation failures when passing data between steps
- Errors mentioning Zod types not matching
- "Expected ZodObject but received..." errors

## Root Cause

The issue occurs when you import `z` from `zod` instead of `@output.ai/core`. While both provide Zod schemas, they create different schema instances that aren't compatible with each other within the Output SDK context.

**Why this matters**: Output SDK uses a specific version of Zod internally for serialization and validation. When you use a different Zod instance, the schemas are technically different objects even if they define the same shape.

## Symptoms

### Error Messages

```
Error: Incompatible schema types
Error: Schema validation failed: expected compatible Zod instance
TypeError: Cannot read property 'parse' of undefined
```

### Code Patterns That Cause This

```typescript
// WRONG: Importing from 'zod' directly
import { z } from 'zod';

const inputSchema = z.object({
  name: z.string(),
});
```

## Solution

### Step 1: Find All Zod Imports

Search your codebase for incorrect imports:

```bash
grep -r "from 'zod'" src/
grep -r 'from "zod"' src/
```

### Step 2: Update Imports

Change all imports from:

```typescript
// Wrong
import { z } from 'zod';
```

To:

```typescript
// Correct
import { z } from '@output.ai/core';
```

### Step 3: Verify No Direct Zod Dependencies

Check your imports don't accidentally use zod elsewhere:

```bash
grep -r "import.*zod" src/
```

All matches should show `@output.ai/core`, not `zod`.

## Complete Example

### Before (Wrong)

```typescript
// src/workflows/my-workflow/steps/process.ts
import { z } from 'zod';  // Wrong!
import { step } from '@output.ai/core';

export const processStep = step({
  name: 'processData',
  inputSchema: z.object({
    id: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  fn: async (input) => {
    return { result: `Processed ${input.id}` };
  },
});
```

### After (Correct)

```typescript
// src/workflows/my-workflow/steps/process.ts
import { z, step } from '@output.ai/core';  // Correct!

export const processStep = step({
  name: 'processData',
  inputSchema: z.object({
    id: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  fn: async (input) => {
    return { result: `Processed ${input.id}` };
  },
});
```

## Verification Steps

### 1. Check for remaining wrong imports

```bash
# Should return no results
grep -r "from 'zod'" src/
grep -r 'from "zod"' src/
```

### 2. Build the project

```bash
npm run output:workflow:build
```

### 3. Run the workflow

```bash
npx output workflow run <workflowName> '<input>'
```

## Prevention

### ESLint Rule (if using ESLint)

Add a rule to prevent direct zod imports:

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    'no-restricted-imports': ['error', {
      paths: [{
        name: 'zod',
        message: "Import { z } from '@output.ai/core' instead of 'zod'"
      }]
    }]
  }
};
```

### IDE Settings

Configure your editor to auto-import from `@output.ai/core`:

For VS Code, add to settings.json:
```json
{
  "typescript.preferences.autoImportFileExcludePatterns": ["zod"]
}
```

## Common Gotchas

### Mixed Imports in Same File
Even one wrong import can cause issues:
```typescript
import { z } from '@output.ai/core';
import { z as zod } from 'zod';  // This causes problems!
```

### Indirect Dependencies
If a utility file uses the wrong import and is shared:
```typescript
// utils/schemas.ts
import { z } from 'zod';  // Wrong! This affects all files using these schemas
export const idSchema = z.string().uuid();
```

### Third-Party Libraries
If using external Zod schemas, you may need to recreate them:
```typescript
// Don't use: externalLibrary.schema
// Instead: recreate the schema with @output.ai/core's z
```

## Related Issues

- If schemas are correct but you still see type errors, check `output-error-missing-schemas`
- For validation failures with correct imports, verify schema definitions match actual data
