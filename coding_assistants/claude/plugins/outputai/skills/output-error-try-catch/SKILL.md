---
name: output-error-try-catch
description: Fix try-catch anti-pattern in Output SDK workflows. Use when retries aren't working, errors are being swallowed, seeing unexpected FatalError wrapping, or when step failures don't trigger retry policies.
allowed-tools: [Bash, Read]
---

# Fix Try-Catch Anti-Pattern

## Overview

This skill helps diagnose and fix a common anti-pattern where step calls are wrapped in try-catch blocks. This prevents Output SDK's retry mechanism from working properly and can lead to confusing error behavior.

## When to Use This Skill

You're seeing:
- Retries not working as expected
- Errors being swallowed silently
- Unexpected FatalError wrapping
- Step failures not triggering retry policies
- Errors being caught and re-thrown incorrectly

## Root Cause

When you wrap step calls in try-catch blocks, you intercept errors before the Output SDK retry mechanism can handle them. This defeats the built-in retry logic and can cause:

1. **Retries not happening**: The error is caught, so the framework doesn't know to retry
2. **Wrong error classification**: Re-throwing as FatalError prevents retries entirely
3. **Lost error context**: Original error details may be lost in the catch block

## Symptoms

### Pattern 1: Errors Swallowed

```typescript
// WRONG: Error is silently ignored
try {
  const result = await myStep(input);
} catch (error) {
  console.log('Step failed');  // Swallowed!
  return { success: false };
}
```

### Pattern 2: FatalError Wrapping

```typescript
// WRONG: Turns retryable errors into fatal errors
try {
  const result = await myStep(input);
} catch (error) {
  throw new FatalError(error.message);  // Prevents retries!
}
```

### Pattern 3: Re-throwing Generic Errors

```typescript
// WRONG: Loses error context and may affect retry behavior
try {
  const result = await myStep(input);
} catch (error) {
  throw new Error(`Step failed: ${error.message}`);
}
```

## Solution

**Let failures propagate naturally.** Remove try-catch blocks around step calls and let the Output SDK handle errors:

### Before (Wrong)

```typescript
export default workflow({
  fn: async (input) => {
    try {
      const data = await fetchDataStep(input);
      const result = await processDataStep(data);
      return result;
    } catch (error) {
      throw new FatalError(error.message);
    }
  }
});
```

### After (Correct)

```typescript
export default workflow({
  fn: async (input) => {
    const data = await fetchDataStep(input);
    const result = await processDataStep(data);
    return result;
  }
});
```

## When Try-Catch IS Appropriate

There are limited cases where catching errors in workflows is valid:

### 1. Optional/Fallback Steps

When a step failure should trigger an alternative path:

```typescript
export default workflow({
  fn: async (input) => {
    let data;
    try {
      data = await fetchFromPrimarySource(input);
    } catch {
      // Fallback to secondary source
      data = await fetchFromSecondarySource(input);
    }
    return await processData(data);
  }
});
```

### 2. Aggregate Results with Partial Failures

When processing multiple items where some may fail:

```typescript
export default workflow({
  fn: async (input) => {
    const results = [];
    for (const item of input.items) {
      try {
        const result = await processItem(item);
        results.push({ item, result, success: true });
      } catch (error) {
        results.push({ item, error: error.message, success: false });
      }
    }
    return results;  // Contains both successes and failures
  }
});
```

**Note**: Even in these cases, be careful not to swallow errors that should cause the whole workflow to fail.

## Finding Try-Catch Around Steps

Search for the pattern:

```bash
# Find try blocks in workflow files
grep -rn "try {" src/workflows/

# Look for FatalError usage
grep -rn "FatalError" src/workflows/
```

Then review each match to see if it's wrapping step calls.

## How Retries Work

When you DON'T catch errors:

1. Step throws an error
2. Output SDK receives the error
3. SDK checks retry policy (configured per step)
4. If retries remain, step is re-executed
5. If retries exhausted, workflow fails with full error context

When you DO catch errors:

1. Step throws an error
2. Your catch block handles it
3. Output SDK never sees the original error
4. Retry logic is bypassed
5. You control what happens (often incorrectly)

## Configuring Retry Behavior

Instead of try-catch, configure retry policies on steps:

```typescript
export const fetchData = step({
  name: 'fetchData',
  retry: {
    maxAttempts: 3,
    initialInterval: '1s',
    maxInterval: '30s',
    backoffCoefficient: 2
  },
  fn: async (input) => {
    // If this fails, it will be retried according to policy
    return await callApi(input);
  }
});
```

## Using FatalError Correctly

FatalError is for errors that should NEVER be retried:

```typescript
export const validateInput = step({
  name: 'validateInput',
  fn: async (input) => {
    if (!input.userId) {
      // This will never succeed on retry
      throw new FatalError('userId is required');
    }
    return input;
  }
});
```

Do NOT use FatalError to wrap other errors unless you're certain they shouldn't retry.

## Verification

After removing try-catch:

1. **Test normal operation**: `npx output workflow run <name> '<valid-input>'`
2. **Test failure scenarios**: Use input that causes step failures
3. **Check retry behavior**: Look for retry attempts in `npx output workflow debug <id>`

## Related Issues

- For configuring retry policies, see step definition documentation
- For handling expected failures gracefully, consider using conditional logic instead of try-catch
