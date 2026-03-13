---
name: flow-error-zod-import
description: Fix Zod schema import issues during Flow to Output SDK migration. Use when seeing "incompatible schema" errors, type errors at step boundaries, or when migrating files that import from 'zod' directly.
allowed-tools: [Bash, Read, Write, Grep, Edit]
---

# Fix Zod Import Source Issues

## Overview

This skill helps diagnose and fix a critical issue where Zod schemas are imported from the wrong source during migration. Output SDK requires schemas to be imported from `@output.ai/core`, not directly from `zod`.

## When to Use This Skill

**During Migration:**
- Converting Flow SDK files that have `import { z } from 'zod'`
- Setting up new Output SDK workflow files

**Error Symptoms:**
- "incompatible schema" errors
- Type errors at step boundaries
- Schema validation failures when passing data between steps
- Errors mentioning Zod types not matching
- "Expected ZodObject but received..." errors
- TypeScript errors about incompatible types between steps

## Root Cause

The issue occurs when you import `z` from `zod` instead of `@output.ai/core`. While both provide Zod schemas, they create different schema instances that aren't compatible with each other within the Output SDK context.

**Why this matters**: Output SDK uses a specific version of Zod internally for serialization and validation. When you use a different Zod instance, the schemas are technically different objects even if they define the same shape. This causes runtime validation failures and TypeScript errors.

## Error Messages

```
Error: Incompatible schema types
Error: Schema validation failed: expected compatible Zod instance
TypeError: Cannot read property 'parse' of undefined
```

## Code Patterns That Cause This

### Wrong (Flow SDK Pattern)

```typescript
// WRONG: Importing from 'zod' directly
import { z } from 'zod';

const inputSchema = z.object({
  name: z.string(),
});

export const myStep = step({
  name: 'myStep',
  inputSchema,
  fn: async (input) => {
    // ...
  }
});
```

### Correct (Output SDK Pattern)

```typescript
// CORRECT: Import z from @output.ai/core
import { z, step } from '@output.ai/core';

const inputSchema = z.object( {
  name: z.string()
} );

export const myStep = step( {
  name: 'myStep',
  inputSchema,
  fn: async ( input ) => {
    // ...
  }
} );
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

**Tip**: Often you can combine with other imports:

```typescript
import { z, step, workflow } from '@output.ai/core';
```

### Step 3: Verify No Direct Zod Dependencies

Check your imports don't accidentally use zod elsewhere:

```bash
grep -r "import.*zod" src/
```

All matches should show `@output.ai/core`, not `zod`.

## Complete Migration Example

### Before (Flow SDK)

```typescript
// src/workflows/my-workflow/types.ts
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
});

export type User = z.infer<typeof UserSchema>;
```

```typescript
// src/workflows/my-workflow/activities.ts
import { z } from 'zod';
import { UserSchema } from './types';

export async function getUser(userId: string): Promise<User> {
  // ...
}
```

### After (Output SDK)

```typescript
// src/workflows/my-workflow/types.ts
import { z } from '@output.ai/core';

export const UserSchema = z.object( {
  id: z.string(),
  email: z.string().email()
} );

export type User = z.infer<typeof UserSchema>;
```

```typescript
// src/workflows/my-workflow/steps.ts
import { z, step } from '@output.ai/core';
import { UserSchema, User } from './types.js';

export const getUser = step( {
  name: 'getUser',
  inputSchema: z.object( {
    userId: z.string()
  } ),
  outputSchema: UserSchema,
  fn: async ( input ) => {
    const { userId } = input;
    // ...
  }
} );
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

### ESLint Rule

Add a rule to prevent direct zod imports in your ESLint config:

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

## Related Skills

- `flow-convert-activities-to-steps` - Full activity to step conversion
- `flow-error-eslint-compliance` - ESLint compliance for migrated code
- `flow-validation-checklist` - Complete migration validation
