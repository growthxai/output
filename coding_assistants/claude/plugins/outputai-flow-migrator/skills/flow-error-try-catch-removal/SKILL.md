---
name: flow-error-try-catch-removal
description: Remove try-catch antipattern from step calls during Flow to Output SDK migration. Use when converting workflow code that wraps step calls in try-catch blocks.
allowed-tools: [Bash, Read, Write, Grep, Edit]
---

# Remove Try-Catch Antipattern from Step Calls

## Overview

This skill helps identify and remove the try-catch antipattern that's common in Flow SDK code but incorrect in Output SDK. In Output SDK, step calls should NOT be wrapped in try-catch blocks - errors should propagate up the chain.

## When to Use This Skill

**During Migration:**
- Converting Flow SDK workflows that use try-catch around activity calls
- Reviewing migrated workflow code for error handling patterns

**Code Patterns to Fix:**
- Try-catch blocks wrapping step calls
- Re-throwing errors as FatalError after catching
- Generic error handling around workflow execution

## Why Try-Catch is Wrong for Step Calls

In Output SDK, the workflow execution engine handles errors automatically:

1. **Automatic Retry Logic**: Steps have built-in retry mechanisms that try-catch interferes with
2. **Error Propagation**: Errors need to bubble up for proper workflow state management
3. **Observability**: Caught and re-thrown errors lose stack trace and context
4. **Workflow Recovery**: The engine can only recover workflows properly when it sees the original error

## Error Patterns

### Flow SDK Pattern (Common but Wrong for Output SDK)

```typescript
// WRONG: Wrapping step calls in try-catch
export default workflow( {
  name: 'someWorkflow',
  description: 'a workflow description',
  inputSchema: WorkflowInputSchema,
  outputSchema: WorkflowOutputSchema,
  fn: async input => {
    try {
      // Step 1: Get User data
      const userData = await getUserData( { userId: input.userId } );

      // Step 2: Get role configuration
      const roleConfig = await getRoleConfig( { role: userData.role } );

      // Step 3: Ensure something
      await ensureSomething( { config: roleConfig } );

      return { success: true };
    } catch ( error ) {
      throw new FatalError( error instanceof Error ? error.message : 'Unknown workflow error' );
    }
  }
} );
```

### Output SDK Pattern (Correct)

```typescript
// CORRECT: Let errors propagate naturally
export default workflow( {
  name: 'someWorkflow',
  description: 'a workflow description',
  inputSchema: WorkflowInputSchema,
  outputSchema: WorkflowOutputSchema,
  fn: async input => {
    // Step 1: Get User data
    const userData = await getUserData( { userId: input.userId } );

    // Step 2: Get role configuration
    const roleConfig = await getRoleConfig( { role: userData.role } );

    // Step 3: Ensure something
    await ensureSomething( { config: roleConfig } );

    return { success: true };
  }
} );
```

## Solution

### Step 1: Find Try-Catch Blocks in Workflows

Search for try-catch patterns in workflow files:

```bash
grep -r "try {" src/workflows/*/workflow.ts
grep -r "} catch" src/workflows/*/workflow.ts
```

### Step 2: Analyze the Try-Catch Purpose

Before removing, understand what the try-catch was doing:

1. **Generic error wrapping** → Remove entirely
2. **Specific error transformation** → Consider if really needed
3. **Cleanup logic** → May need different approach

### Step 3: Remove Try-Catch, Keep Logic

Remove the try-catch wrapper but keep the step calls:

```typescript
// Before
fn: async input => {
  try {
    const result = await someStep( input );
    return result;
  } catch ( error ) {
    throw new FatalError( error.message );
  }
}

// After
fn: async input => {
  const result = await someStep( input );
  return result;
}
```

## When Try-Catch IS Appropriate

Try-catch is still appropriate in specific cases:

### 1. Inside Steps (Not Workflows)

Steps can use try-catch for internal logic:

```typescript
export const fetchExternalData = step( {
  name: 'fetchExternalData',
  inputSchema: z.object( { url: z.string() } ),
  fn: async ( input ) => {
    try {
      const response = await fetch( input.url );
      return response.json();
    } catch ( error ) {
      // Transform to ValidationError for expected failures
      throw new ValidationError( `Failed to fetch: ${input.url}` );
    }
  }
} );
```

### 2. For Specific Error Types

When you need to handle a specific error type differently:

```typescript
fn: async input => {
  const userData = await getUserData( { userId: input.userId } );

  try {
    await sendNotification( { userId: userData.id } );
  } catch ( error ) {
    // Only catch specific expected errors
    if ( error instanceof NotificationDisabledError ) {
      // User has notifications disabled - continue without notification
      console.log( 'Notifications disabled for user' );
    } else {
      throw error; // Re-throw unexpected errors
    }
  }

  return { success: true };
}
```

### 3. For Optional Operations

When a failure shouldn't stop the workflow:

```typescript
fn: async input => {
  const result = await processData( input );

  // Optional: try to cache result, but don't fail if caching fails
  try {
    await cacheResult( { key: input.id, value: result } );
  } catch {
    // Caching failed - log but continue
    console.warn( 'Failed to cache result' );
  }

  return result;
}
```

## Complete Migration Example

### Before (Flow SDK with Try-Catch)

```typescript
import { FatalError } from '@flow/sdk';
import { getUserData, processUser, saveResults } from './activities';

export default class UserProcessingWorkflow {
  async execute(input: WorkflowInput): Promise<WorkflowOutput> {
    try {
      const user = await getUserData(input.userId);
      const processed = await processUser(user);
      await saveResults(processed);
      return { success: true, userId: user.id };
    } catch (error) {
      throw new FatalError(`Workflow failed: ${error.message}`);
    }
  }
}
```

### After (Output SDK without Try-Catch)

```typescript
import { workflow, z } from '@output.ai/core';
import { getUserData, processUser, saveResults } from './steps.js';
import { WorkflowInputSchema, WorkflowOutputSchema } from './types.js';

export default workflow( {
  name: 'userProcessing',
  description: 'Process user data',
  inputSchema: WorkflowInputSchema,
  outputSchema: WorkflowOutputSchema,
  fn: async input => {
    const user = await getUserData( { userId: input.userId } );
    const processed = await processUser( { user } );
    await saveResults( { data: processed } );
    return { success: true, userId: user.id };
  }
} );
```

## Verification Steps

### 1. Search for remaining try-catch in workflows

```bash
# Should return minimal results (only appropriate uses)
grep -A5 "try {" src/workflows/*/workflow.ts
```

### 2. Run the workflow

```bash
npx output workflow run <workflowName> --input '{}'
```

### 3. Test error scenarios

Intentionally trigger an error to verify it propagates correctly.

## Related Skills

- `flow-convert-workflow-definition` - Full workflow conversion
- `flow-convert-activities-to-steps` - Step conversion patterns
- `flow-validation-checklist` - Complete migration validation
