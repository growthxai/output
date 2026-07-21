---
name: output-error-try-catch
description: Handle errors caught in Output workflows without losing failure context. Use when adding workflow try/catch logic, fallbacks, partial-failure handling, custom Error classes, or typed checks for errors thrown by steps and evaluators.
allowed-tools: [Bash, Read, Write, Edit]
---

# Handle Errors in Workflows

## Understand when workflow catch blocks run

Steps and evaluators run as Temporal Activities. Temporal applies their configured retry policy before returning a successful result or throwing a final failure to workflow code.

A workflow `catch` around a step therefore runs only after the step has exhausted its Activity retries. Catching that failure does not disable or bypass the Activity retry policy.

The catch block decides what the workflow does with the final failure:

- Return a fallback value.
- Run an alternative step.
- Record a partial failure and continue.
- Handle an expected error type.
- Rethrow the error and fail the workflow.

## Let unexpected failures propagate

Do not add a catch block that only wraps or logs an error. It can discard Temporal's failure type, cause chain, and retry metadata.

```typescript
// Avoid: replaces the original Temporal failure chain.
try {
  return await fetchData( input );
} catch ( error ) {
  throw new Error( `Fetch failed: ${error.message}` );
}
```

When the workflow cannot recover, let the step failure propagate:

```typescript
export default workflow( {
  name: 'fetch_workflow',
  fn: async input => fetchData( input )
} );
```

If a catch block handles only known failures, always rethrow everything else.

## Check specific error types with hasErrorType

Errors crossing from a step or evaluator into workflow code are serialized into a Temporal failure cause chain. The original JavaScript object identity is not preserved, so `error instanceof CustomError` is unreliable.

Use `hasErrorType` from `@outputai/core`. It walks the cause chain and matches native instances and Temporal's serialized `type` and `name` fields.

```typescript
import { hasErrorType, workflow } from '@outputai/core';
import { lookupCompany } from './steps.js';
import { CompanyNotFoundError } from './types.js';

export default workflow( {
  name: 'company_lookup',
  fn: async input => {
    try {
      return await lookupCompany( input );
    } catch ( error ) {
      if ( hasErrorType( error, CompanyNotFoundError ) ) {
        return null;
      }

      throw error;
    }
  }
} );
```

Define custom Error classes in a shared module imported by both the workflow and step:

```typescript
export class CompanyNotFoundError extends Error {}
```

Do not inspect a fixed number of `.cause` levels or check only the outer `ActivityFailure`.

## Valid try/catch patterns

### Fallback step

```typescript
const fetchWithFallback = async input => {
  try {
    return await fetchFromPrimarySource( input );
  } catch {
    return fetchFromSecondarySource( input );
  }
};
```

Use this only when every primary-source failure should trigger the fallback. Use `hasErrorType` when only specific failures are recoverable.

### Partial failures

```typescript
const results = await Promise.all( input.items.map( async item => {
  try {
    return { item, value: await processItem( item ), ok: true };
  } catch ( error ) {
    const message = error instanceof Error ? error.message : String( error );
    return { item, error: message, ok: false };
  }
} ) );
```

Ensure the workflow output schema supports both successful and failed entries. Do not silently omit failures.

## Configure Activity retries separately

Configure step and evaluator retry behavior through workflow Activity options. The workflow catch block handles only the failure that remains after this policy is exhausted.

```typescript
export default workflow( {
  name: 'company_lookup',
  fn: async input => lookupCompany( input ),
  options: {
    activityOptions: {
      retry: {
        initialInterval: '1s',
        maximumAttempts: 3
      }
    }
  }
} );
```

## Review checklist

- Catch only when the workflow has a defined recovery path.
- Use `hasErrorType` for specific errors originating in steps or evaluators.
- Rethrow unmatched errors unchanged.
- Do not replace an existing failure with a generic `Error`.
- Keep custom Error class names stable because Temporal serializes them as failure types.
- Configure retries independently from workflow catch behavior.
