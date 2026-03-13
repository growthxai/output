---
name: output-error-direct-io
description: Fix direct I/O in Output SDK workflow functions. Use when workflow hangs, returns undefined, shows "workflow must be deterministic" errors, or when HTTP/API calls are made directly in workflow code.
allowed-tools: [Bash, Read]
---

# Fix Direct I/O in Workflow Functions

## Overview

This skill helps diagnose and fix a critical error pattern where I/O operations (HTTP calls, database queries, file operations) are performed directly in workflow functions instead of in steps. This violates Temporal's determinism requirements.

## When to Use This Skill

You're seeing:
- Workflow hangs indefinitely
- Undefined or empty responses
- "workflow must be deterministic" errors
- Network operations failing silently
- Timeouts without clear cause

## Root Cause

Workflow functions must be **deterministic** - they should only orchestrate steps, not perform I/O directly. When you make HTTP calls, database queries, or any external operations directly in a workflow function:

1. **Hangs**: The workflow may hang because I/O isn't properly handled
2. **Determinism violations**: Temporal replays workflows, and I/O results differ
3. **No retry logic**: Direct calls bypass Output SDK's retry mechanisms
4. **No tracing**: Operations aren't recorded in the workflow trace

## Symptoms

### Direct fetch/axios in Workflow

```typescript
// WRONG: I/O directly in workflow
export default workflow({
  fn: async (input) => {
    const response = await fetch('https://api.example.com/data');  // BAD!
    const data = await response.json();
    return { data };
  }
});
```

### Direct Database Calls

```typescript
// WRONG: Database I/O in workflow
export default workflow({
  fn: async (input) => {
    const user = await db.users.findById(input.userId);  // BAD!
    return { user };
  }
});
```

### File System Operations

```typescript
// WRONG: File I/O in workflow
import fs from 'fs/promises';

export default workflow({
  fn: async (input) => {
    const data = await fs.readFile(input.path, 'utf-8');  // BAD!
    return { data };
  }
});
```

## Solution

Move ALL I/O operations to step functions. Steps are designed to handle non-deterministic operations.

### Before (Wrong)

```typescript
export default workflow({
  fn: async (input) => {
    const response = await fetch('https://api.example.com/data');
    const data = await response.json();
    return { data };
  }
});
```

### After (Correct)

```typescript
import { z, step, workflow } from '@output.ai/core';
import { httpClient } from '@output.ai/http';

// Create a step for the I/O operation
export const fetchData = step({
  name: 'fetchData',
  inputSchema: z.object({
    endpoint: z.string(),
  }),
  outputSchema: z.object({
    data: z.unknown(),
  }),
  fn: async (input) => {
    const client = httpClient({ prefixUrl: 'https://api.example.com' });
    const data = await client.get(input.endpoint).json();
    return { data };
  },
});

// Workflow only orchestrates steps
export default workflow({
  inputSchema: z.object({}),
  outputSchema: z.object({ data: z.unknown() }),
  fn: async (input) => {
    const result = await fetchData({ endpoint: 'data' });
    return result;
  },
});
```

## Complete Example: Database Operation

### Before (Wrong)

```typescript
export default workflow({
  fn: async (input) => {
    const user = await prisma.user.findUnique({
      where: { id: input.userId }
    });
    const orders = await prisma.order.findMany({
      where: { userId: input.userId }
    });
    return { user, orders };
  }
});
```

### After (Correct)

```typescript
import { z, step, workflow } from '@output.ai/core';
import { prisma } from '../lib/db';

export const fetchUser = step({
  name: 'fetchUser',
  inputSchema: z.object({ userId: z.string() }),
  outputSchema: z.object({
    user: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    }).nullable(),
  }),
  fn: async (input) => {
    const user = await prisma.user.findUnique({
      where: { id: input.userId }
    });
    return { user };
  },
});

export const fetchOrders = step({
  name: 'fetchOrders',
  inputSchema: z.object({ userId: z.string() }),
  outputSchema: z.object({
    orders: z.array(z.object({
      id: z.string(),
      total: z.number(),
    })),
  }),
  fn: async (input) => {
    const orders = await prisma.order.findMany({
      where: { userId: input.userId }
    });
    return { orders };
  },
});

export default workflow({
  inputSchema: z.object({ userId: z.string() }),
  outputSchema: z.object({
    user: z.unknown(),
    orders: z.array(z.unknown()),
  }),
  fn: async (input) => {
    const { user } = await fetchUser({ userId: input.userId });
    const { orders } = await fetchOrders({ userId: input.userId });
    return { user, orders };
  },
});
```

## Finding Direct I/O in Workflows

Search for common I/O patterns in workflow files:

```bash
# Find fetch calls
grep -rn "await fetch" src/workflows/

# Find axios calls
grep -rn "axios\." src/workflows/

# Find database operations
grep -rn "prisma\.\|db\.\|mongoose\." src/workflows/

# Find file system operations
grep -rn "fs\.\|readFile\|writeFile" src/workflows/
```

Then review each match to see if it's in a workflow function vs a step function.

## What CAN Be in Workflow Functions

Workflow functions should contain:
- **Step calls**: `await myStep(input)`
- **Orchestration logic**: conditionals, loops (over step calls)
- **Data transformation**: Pure functions on step results
- **Constants**: Static values and configuration

Workflow functions should NOT contain:
- HTTP/API calls
- Database operations
- File system operations
- External service calls
- Anything that talks to the network or filesystem

## Verification

After moving I/O to steps:

1. **Run the workflow**: `npx output workflow run <name> '<input>'`
2. **Check the trace**: `npx output workflow debug <id> --format json`
3. **Verify steps appear**: Look for your I/O steps in the trace
4. **Confirm no errors**: No determinism warnings or hangs

## Benefits of Steps for I/O

1. **Retry logic**: Steps can be retried on failure
2. **Tracing**: I/O operations appear in workflow traces
3. **Timeouts**: Steps can have individual timeouts
4. **Determinism**: Replays use recorded results
5. **Debugging**: Clear visibility into what happened

## Related Issues

- For HTTP client best practices, see `output-error-http-client`
- For non-determinism from other causes, see `output-error-nondeterminism`
