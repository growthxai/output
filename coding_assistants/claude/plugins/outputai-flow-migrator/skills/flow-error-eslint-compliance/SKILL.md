---
name: flow-error-eslint-compliance
description: Fix ESLint issues in migrated Output SDK code. Use when seeing lint errors after migration, or when writing new Output SDK code that needs to follow project conventions.
allowed-tools: [Bash, Read, Write, Grep, Edit]
---

# ESLint Compliance for Output SDK Code

## Overview

This skill helps fix ESLint issues that commonly arise during Flow to Output SDK migration. The Output SDK project enforces strict ESLint rules that must be followed in all code.

## When to Use This Skill

**After Migration:**
- Running `npm run lint` shows errors
- IDE highlights style issues in migrated code

**During Code Review:**
- Reviewing migrated code for style compliance
- Ensuring new code follows conventions

## ESLint Rules Reference

### 1. No Trailing Commas

Never use trailing commas in arrays, objects, or function parameters.

```typescript
// WRONG
const config = {
  name: 'workflow',
  version: '1.0',  // trailing comma
};

const items = [
  'item1',
  'item2',  // trailing comma
];

// CORRECT
const config = {
  name: 'workflow',
  version: '1.0'
};

const items = [
  'item1',
  'item2'
];
```

### 2. Array Bracket Spacing

Always include spaces inside array brackets.

```typescript
// WRONG
const items = [item1, item2];
const empty = [];

// CORRECT
const items = [ item1, item2 ];
const empty = [];  // empty arrays don't need spaces
```

### 3. No Return Await

Don't use `return await`, just return the promise directly.

```typescript
// WRONG
async function getData() {
  return await fetchData();
}

// CORRECT
async function getData() {
  return fetchData();
}

// Also CORRECT (if you need to do something after)
async function getData() {
  const result = await fetchData();
  console.log( 'Fetched:', result );
  return result;
}
```

### 4. Line Length (Max 150 Characters)

Break long lines to stay under 150 characters.

```typescript
// WRONG
const { output } = await generateText( { prompt: 'analyze@v1', variables: { topic: input.topic, context: input.context, additionalInfo: input.additionalInfo }, output: Output.object( { schema: z.object( { result: z.string() } ) } ) } );

// CORRECT
const { output } = await generateText( {
  prompt: 'analyze@v1',
  variables: {
    topic: input.topic,
    context: input.context,
    additionalInfo: input.additionalInfo
  },
  output: Output.object( {
    schema: z.object( { result: z.string() } )
  } )
} );
```

### 5. Parentheses Spacing

Always include spaces inside parentheses (except empty ones).

```typescript
// WRONG
if (condition) {
  doSomething(arg1, arg2);
}
for (let i = 0; i < 10; i++) {
}

// CORRECT
if ( condition ) {
  doSomething( arg1, arg2 );
}
for ( let i = 0; i < 10; i++ ) {
}

// Empty parentheses don't need spaces
fn();
new Class();
```

### 6. Single Quotes

Use single quotes for strings, not double quotes.

```typescript
// WRONG
const name = "workflow";
import { step } from "@output.ai/core";

// CORRECT
const name = 'workflow';
import { step } from '@output.ai/core';
```

### 7. Spaces Around Operators

Add spaces around operators.

```typescript
// WRONG
const sum = a+b;
const isValid = count>0&&count<10;

// CORRECT
const sum = a + b;
const isValid = count > 0 && count < 10;
```

### 8. Camelcase for Variables

Use camelCase for variable names.

```typescript
// WRONG
const user_name = 'John';
const UserData = {};

// CORRECT
const userName = 'John';
const userData = {};
```

### 9. Const/Let Instead of Var

Never use `var`, always use `const` or `let`.

```typescript
// WRONG
var count = 0;
var name = 'test';

// CORRECT
let count = 0;
const name = 'test';
```

### 10. Object Curly Spacing

Include spaces inside object braces.

```typescript
// WRONG
const obj = {key: 'value'};

// CORRECT
const obj = { key: 'value' };
```

## Quick Fix Commands

### Run ESLint Auto-Fix

```bash
npm run lint:fix
```

### Check Specific Files

```bash
npx eslint src/workflows/my-workflow/*.ts
```

### Fix Specific Files

```bash
npx eslint --fix src/workflows/my-workflow/*.ts
```

## Complete Example

### Before (Non-Compliant)

```typescript
import {z} from "@output.ai/core";
import {step, workflow} from "@output.ai/core";

const InputSchema = z.object({
  user_id: z.string(),
  search_query: z.string(),
});

export const searchStep = step({
  name: "searchStep",
  inputSchema: InputSchema,
  fn: async (input) => {
    var results = [];
    if(input.search_query.length>0) {
      const data = await fetchResults(input.search_query, input.user_id);
      results = [data.item1, data.item2,];
    }
    return await processResults({results: results,});
  },
});
```

### After (ESLint Compliant)

```typescript
import { z } from '@output.ai/core';
import { step, workflow } from '@output.ai/core';

const InputSchema = z.object( {
  userId: z.string(),
  searchQuery: z.string()
} );

export const searchStep = step( {
  name: 'searchStep',
  inputSchema: InputSchema,
  fn: async ( input ) => {
    let results = [];
    if ( input.searchQuery.length > 0 ) {
      const data = await fetchResults( input.searchQuery, input.userId );
      results = [ data.item1, data.item2 ];
    }
    return processResults( { results: results } );
  }
} );
```

## Common Migration Patterns

### Flow SDK to Output SDK Import Style

```typescript
// Flow SDK style (may have inconsistent quotes/spacing)
import {z} from "zod";
import { WorkflowScope } from "@flow/sdk";

// Output SDK style (consistent single quotes, spacing)
import { z, step, workflow } from '@output.ai/core';
```

### Function Parameter Style

```typescript
// Flow SDK style
async function myActivity(param1: string, param2: number) {
  // ...
}

// Output SDK style with ESLint compliance
export const myStep = step( {
  name: 'myStep',
  inputSchema: z.object( {
    param1: z.string(),
    param2: z.number()
  } ),
  fn: async ( input ) => {
    const { param1, param2 } = input;
    // ...
  }
} );
```

## Verification Steps

### 1. Run lint check

```bash
npm run lint
```

### 2. Auto-fix what can be fixed

```bash
npm run lint:fix
```

### 3. Manually fix remaining issues

Review any errors that couldn't be auto-fixed and apply the rules above.

### 4. Verify no errors remain

```bash
npm run lint
# Should exit with 0 errors
```

## Related Skills

- `flow-error-zod-import` - Zod import source issues
- `flow-convert-activities-to-steps` - Step conversion with proper style
- `flow-validation-checklist` - Complete migration validation
