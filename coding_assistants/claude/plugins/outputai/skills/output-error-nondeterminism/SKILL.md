---
name: output-error-nondeterminism
description: Fix non-determinism errors in Output SDK workflows. Use when seeing replay failures, inconsistent results between runs, "non-deterministic" error messages, or workflows behaving differently on retry.
allowed-tools: [Bash, Read]
---

# Fix Non-Determinism Errors

## Overview

This skill helps diagnose and fix non-determinism errors in Output SDK workflows. Workflows must be deterministic because Temporal may replay them during recovery or retries, and the replay must produce identical results.

## When to Use This Skill

You're seeing:
- "non-deterministic" error messages
- Replay failures after workflow restart
- Inconsistent results between runs with same input
- Errors during workflow recovery
- Warnings about determinism violations

## Root Cause

Temporal workflows must be deterministic: given the same input, they must always execute the same sequence of operations. This is because Temporal replays workflow history to recover state after crashes or restarts.

Non-deterministic operations break this replay mechanism because they produce different values each time.

## Common Causes and Solutions

### 1. Math.random()

**Problem**: Random values differ on each execution.

```typescript
// WRONG: Non-deterministic
export default workflow({
  fn: async (input) => {
    const id = Math.random().toString(36);  // Different each time!
    return await processWithId({ id });
  }
});
```

**Solution**: Pass random values as workflow input or generate in a step.

```typescript
// Option 1: Pass as input
export default workflow({
  inputSchema: z.object({
    id: z.string()  // Generate ID before calling workflow
  }),
  fn: async (input) => {
    return await processWithId({ id: input.id });
  }
});

// Option 2: Generate in a step (steps can be non-deterministic)
export const generateId = step({
  name: 'generateId',
  fn: async () => ({ id: Math.random().toString(36) })
});

export default workflow({
  fn: async (input) => {
    const { id } = await generateId({});
    return await processWithId({ id });
  }
});
```

### 2. Date.now() / new Date()

**Problem**: Timestamps change between executions.

```typescript
// WRONG: Non-deterministic
export default workflow({
  fn: async (input) => {
    const timestamp = Date.now();  // Different each replay!
    return await logEvent({ timestamp });
  }
});
```

**Solution**: Pass timestamps as input or use Temporal's time API.

```typescript
// Option 1: Pass as input
export default workflow({
  inputSchema: z.object({
    timestamp: z.number()
  }),
  fn: async (input) => {
    return await logEvent({ timestamp: input.timestamp });
  }
});

// Option 2: Generate in a step
export const getTimestamp = step({
  name: 'getTimestamp',
  fn: async () => ({ timestamp: Date.now() })
});
```

### 3. crypto.randomUUID()

**Problem**: UUIDs differ each execution.

```typescript
// WRONG: Non-deterministic
import { randomUUID } from 'crypto';

export default workflow({
  fn: async (input) => {
    const requestId = randomUUID();  // Different each time!
    return await makeRequest({ requestId });
  }
});
```

**Solution**: Generate UUIDs as input or in steps.

```typescript
// Correct: Generate in step
export const generateRequestId = step({
  name: 'generateRequestId',
  fn: async () => {
    const { randomUUID } = await import('crypto');
    return { requestId: randomUUID() };
  }
});
```

### 4. Dynamic Imports

**Problem**: Dynamic imports may resolve differently.

```typescript
// WRONG: Non-deterministic import timing
export default workflow({
  fn: async (input) => {
    const module = await import(`./handlers/${input.type}`);
    return module.handle(input);
  }
});
```

**Solution**: Use static imports and conditional logic.

```typescript
// Correct: Static imports with conditional use
import { handleTypeA } from './handlers/typeA';
import { handleTypeB } from './handlers/typeB';

export default workflow({
  fn: async (input) => {
    if (input.type === 'A') {
      return await handleTypeA(input);
    } else {
      return await handleTypeB(input);
    }
  }
});
```

### 5. Environment Variables

**Problem**: Environment may differ between replays.

```typescript
// WRONG: Environment can change
export default workflow({
  fn: async (input) => {
    const apiUrl = process.env.API_URL;  // May differ on different workers
    return await callApi({ url: apiUrl });
  }
});
```

**Solution**: Pass configuration as input or use constants.

```typescript
// Correct: Pass as input
export default workflow({
  inputSchema: z.object({
    apiUrl: z.string()
  }),
  fn: async (input) => {
    return await callApi({ url: input.apiUrl });
  }
});
```

## How to Find Non-Deterministic Code

### Search for Common Patterns

```bash
# Find Math.random usage
grep -rn "Math.random" src/workflows/

# Find Date.now or new Date
grep -rn "Date.now\|new Date" src/workflows/

# Find crypto random functions
grep -rn "randomUUID\|randomBytes" src/workflows/

# Find dynamic imports
grep -rn "import(" src/workflows/
```

### Review Workflow Files

Look at your workflow `fn` functions specifically. Non-deterministic code is only a problem **in workflow functions**, not in step functions.

## Verification Steps

1. **Fix the code** using solutions above
2. **Run the workflow**: `npx output workflow run <name> '<input>'`
3. **Run again with same input**: Result should be identical
4. **Check for errors**: No "non-deterministic" messages

## The Determinism Rule

**Workflow functions must be deterministic:**
- Same input = same execution path
- No side effects (network, filesystem, random values)
- Only orchestration logic and step calls

**Step functions can be non-deterministic:**
- Steps record their results in Temporal history
- Replays use recorded results, not re-execution
- All I/O should happen in steps

## Debugging Tip

If unsure whether code is causing issues:

```bash
# Run the workflow
npx output workflow start my-workflow '{"input": "test"}'

# Get the workflow ID and run debug to see replay behavior
npx output workflow debug <workflowId> --format json
```

Look for errors or warnings about non-determinism in the trace.

## Related Issues

- For I/O in workflow code, see `output-error-direct-io`
- For random values needed in logic, generate them in steps or pass as input
