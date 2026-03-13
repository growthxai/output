---
name: output-error-missing-schemas
description: Fix missing schema definitions in Output SDK steps. Use when seeing type errors, undefined properties at step boundaries, validation failures, or when step inputs/outputs aren't being properly typed.
allowed-tools: [Bash, Read]
---

# Fix Missing Schema Definitions

## Overview

This skill helps diagnose and fix issues caused by steps that lack explicit `inputSchema` or `outputSchema` definitions. Schemas are essential for type safety, validation, and proper data serialization between steps.

## When to Use This Skill

You're seeing:
- Type errors at step boundaries
- Undefined properties in step inputs/outputs
- Validation failures when passing data between steps
- TypeScript errors about incompatible types
- Runtime errors about unexpected data shapes

## Root Cause

Steps without explicit schemas:
- Don't validate input data at runtime
- Don't provide TypeScript type inference
- May serialize/deserialize data incorrectly
- Can pass undefined or malformed data silently

## Symptoms

### Missing Input Schema

```typescript
// WRONG: No input validation
export const processData = step({
  name: 'processData',
  // inputSchema: missing!
  outputSchema: z.object({ result: z.string() }),
  fn: async (input) => {
    return { result: input.value };  // input.value might be undefined!
  }
});
```

### Missing Output Schema

```typescript
// WRONG: No output validation
export const fetchData = step({
  name: 'fetchData',
  inputSchema: z.object({ id: z.string() }),
  // outputSchema: missing!
  fn: async (input) => {
    return { data: await getFromApi(input.id) };  // Output shape not validated
  }
});
```

### Both Schemas Missing

```typescript
// WRONG: No validation at all
export const transformData = step({
  name: 'transformData',
  // No schemas!
  fn: async (input) => {
    return transform(input);
  }
});
```

## Solution

Always define both `inputSchema` and `outputSchema` for every step:

### Complete Step Definition

```typescript
import { z, step } from '@output.ai/core';

export const processData = step({
  name: 'processData',
  inputSchema: z.object({
    id: z.string(),
    value: z.number(),
    optional: z.string().optional(),
  }),
  outputSchema: z.object({
    result: z.string(),
    processedAt: z.number(),
  }),
  fn: async (input) => {
    // input is fully typed: { id: string, value: number, optional?: string }
    return {
      result: `Processed ${input.id}`,
      processedAt: Date.now(),
    };
    // output is validated against outputSchema
  },
});
```

## Schema Definition Best Practices

### Use Descriptive Schemas

```typescript
// Good: Clear, descriptive schema
inputSchema: z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  age: z.number().int().positive(),
})
```

### Handle Optional Fields

```typescript
inputSchema: z.object({
  required: z.string(),
  optional: z.string().optional(),
  withDefault: z.string().default('fallback'),
})
```

### Use Schema Composition

```typescript
// Define reusable schemas
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const addressSchema = z.object({
  street: z.string(),
  city: z.string(),
});

// Compose in step
inputSchema: z.object({
  user: userSchema,
  address: addressSchema,
})
```

### Handle Arrays and Nested Objects

```typescript
inputSchema: z.object({
  items: z.array(z.object({
    id: z.string(),
    quantity: z.number(),
  })),
  metadata: z.record(z.string()),
})
```

## Finding Steps Without Schemas

Search your codebase:

```bash
# Find step definitions
grep -rn "step({" src/workflows/

# Look for steps without inputSchema
grep -A5 "step({" src/workflows/ | grep -B2 "fn:"

# Check if schemas are present
grep -rn "inputSchema:" src/workflows/
grep -rn "outputSchema:" src/workflows/
```

Review each step definition to ensure both schemas are present.

## Benefits of Explicit Schemas

1. **Runtime Validation**: Catches data errors early
2. **Type Safety**: Full TypeScript inference in step functions
3. **Documentation**: Schemas document expected data shapes
4. **Serialization**: Ensures proper data serialization between steps
5. **Error Messages**: Clear validation errors when data is wrong

## Common Schema Patterns

### API Response Steps

```typescript
export const fetchUser = step({
  name: 'fetchUser',
  inputSchema: z.object({
    userId: z.string(),
  }),
  outputSchema: z.object({
    user: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    }).nullable(),  // Handle not found
    found: z.boolean(),
  }),
  fn: async (input) => {
    const user = await api.getUser(input.userId);
    return { user, found: user !== null };
  },
});
```

### Transformation Steps

```typescript
export const transformData = step({
  name: 'transformData',
  inputSchema: z.object({
    raw: z.array(z.unknown()),
  }),
  outputSchema: z.object({
    processed: z.array(z.object({
      id: z.string(),
      value: z.number(),
    })),
    count: z.number(),
  }),
  fn: async (input) => {
    const processed = input.raw.map(transformItem);
    return { processed, count: processed.length };
  },
});
```

### Void Output Steps

For steps that don't return meaningful data:

```typescript
export const logEvent = step({
  name: 'logEvent',
  inputSchema: z.object({
    event: z.string(),
    data: z.record(z.unknown()),
  }),
  outputSchema: z.object({
    logged: z.literal(true),
  }),
  fn: async (input) => {
    await logger.log(input.event, input.data);
    return { logged: true };
  },
});
```

## Verification

After adding schemas:

1. **TypeScript check**: `npm run output:workflow:build` should pass without type errors
2. **Runtime test**: `npx output workflow run <name> '<input>'` should validate correctly
3. **Invalid input test**: Pass invalid data and verify validation errors appear

## Related Issues

- For Zod import issues, see `output-error-zod-import`
- For type mismatches despite schemas, verify schema matches actual data
