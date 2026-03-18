---
name: flow-convert-activities-to-steps
description: Convert Flow SDK activities.ts to Output SDK steps.ts. Use when migrating activity functions to step definitions with typed parameters.
allowed-tools: [Bash, Read, Write, Grep, Edit]
---

# Convert Flow Activities to Output Steps

## Overview

This skill guides the conversion of Flow SDK activity functions (`activities.ts`) to Output SDK step definitions (`steps.ts`). This is one of the core migration tasks.

## When to Use This Skill

**During Migration:**
- Converting `activities.ts` file to `steps.ts`
- Transforming individual activity functions to step definitions
- Setting up typed input/output schemas for steps

## Key Differences

| Aspect | Flow SDK (activities.ts) | Output SDK (steps.ts) |
|--------|--------------------------|----------------------|
| Definition | Function with direct parameters | `step()` with inputSchema |
| Parameters | Individual function arguments | Single typed input object |
| Return Type | Direct Promise return | outputSchema validation |
| Imports | Various Flow SDK imports | `@outputai/core` |
| LLM Calls | Custom completion functions | `generateText()` with `Output.object()` |

## Conversion Pattern

### Flow SDK Activity (Before)

```typescript
// activities.ts
import { z } from 'zod';
import { completion } from '@flow/sdk';

export async function analyzeDocument(
  documentText: string,
  analysisType: string,
  maxLength?: number
): Promise<AnalysisResult> {
  const prompt = buildPrompt( documentText, analysisType );

  const response = await completion( {
    model: 'gpt-4',
    messages: [ { role: 'user', content: prompt } ],
    maxTokens: maxLength || 2000
  } );

  return parseAnalysisResult( response );
}
```

### Output SDK Step (After)

```typescript
// steps.ts
import { z, step } from '@outputai/core';
import { generateText, Output } from '@outputai/llm';
import { AnalysisResultSchema, AnalysisResult } from './types.js';

const AnalyzeDocumentInputSchema = z.object( {
  documentText: z.string(),
  analysisType: z.string(),
  maxLength: z.number().optional()
} );

export const analyzeDocument = step( {
  name: 'analyzeDocument',
  inputSchema: AnalyzeDocumentInputSchema,
  outputSchema: AnalysisResultSchema,
  fn: async ( input ) => {
    const { documentText, analysisType, maxLength } = input;

    const { output } = await generateText( {
      prompt: 'analyzeDocument@v1',
      variables: {
        documentText,
        analysisType
      },
      output: Output.object( {
        schema: AnalysisResultSchema
      } )
    } );

    return output;
  }
} );
```

## Step-by-Step Conversion Process

### Step 1: Identify All Activities

List all exported functions in `activities.ts`:

```bash
grep -E "^export (async )?function" src/workflows/my-workflow/activities.ts
```

### Step 2: Create Input Schema for Each Activity

For each function, create a Zod schema for its parameters:

```typescript
// Original function signature
async function processUser( userId: string, options: ProcessOptions ): Promise<Result>

// Convert to input schema
const ProcessUserInputSchema = z.object( {
  userId: z.string(),
  options: ProcessOptionsSchema
} );
```

### Step 3: Create Output Schema (If Needed)

If the function returns structured data, create an output schema:

```typescript
// types.ts
export const ResultSchema = z.object( {
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional()
} );

export type Result = z.infer<typeof ResultSchema>;
```

### Step 4: Convert Function to Step

Wrap the function body in a `step()` definition:

```typescript
export const processUser = step( {
  name: 'processUser',
  inputSchema: ProcessUserInputSchema,
  outputSchema: ResultSchema,
  fn: async ( input ) => {
    const { userId, options } = input;
    // Original function body here
  }
} );
```

### Step 5: Update LLM Calls

Replace Flow SDK completion calls with Output SDK generators:

```typescript
// Flow SDK
const response = await completion( { model: 'gpt-4', messages: [...] } );

// Output SDK
const { result } = await generateText( {
  prompt: 'myPrompt@v1',
  variables: { ... }
} );
```

## Complete Migration Example

### Before: activities.ts (Flow SDK)

```typescript
import { z } from 'zod';
import { completion } from '@flow/sdk';

const UserSchema = z.object( {
  id: z.string(),
  name: z.string(),
  email: z.string()
} );

type User = z.infer<typeof UserSchema>;

export async function fetchUser( userId: string ): Promise<User> {
  const response = await fetch( `https://api.example.com/users/${userId}` );
  return response.json();
}

export async function generateGreeting(
  user: User,
  style: 'formal' | 'casual'
): Promise<string> {
  const prompt = style === 'formal'
    ? `Write a formal greeting for ${user.name}`
    : `Write a casual greeting for ${user.name}`;

  const response = await completion( {
    model: 'gpt-4',
    messages: [ { role: 'user', content: prompt } ]
  } );

  return response.content;
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<{ sent: boolean; messageId: string }> {
  const result = await emailService.send( { to, subject, body } );
  return { sent: true, messageId: result.id };
}
```

### After: steps.ts (Output SDK)

```typescript
import { z, step } from '@outputai/core';
import { generateText } from '@outputai/llm';
import { UserSchema, User } from './types.js';

// Step 1: Fetch User
const FetchUserInputSchema = z.object( {
  userId: z.string()
} );

export const fetchUser = step( {
  name: 'fetchUser',
  inputSchema: FetchUserInputSchema,
  outputSchema: UserSchema,
  fn: async ( input ) => {
    const { userId } = input;
    const response = await fetch( `https://api.example.com/users/${userId}` );
    return response.json();
  }
} );

// Step 2: Generate Greeting
const GenerateGreetingInputSchema = z.object( {
  user: UserSchema,
  style: z.enum( [ 'formal', 'casual' ] )
} );

export const generateGreeting = step( {
  name: 'generateGreeting',
  inputSchema: GenerateGreetingInputSchema,
  outputSchema: z.string(),
  fn: async ( input ) => {
    const { user, style } = input;

    const { result } = await generateText( {
      prompt: 'generateGreeting@v1',
      variables: {
        userName: user.name,
        style
      }
    } );

    return result;
  }
} );

// Step 3: Send Email
const SendEmailInputSchema = z.object( {
  to: z.string(),
  subject: z.string(),
  body: z.string()
} );

const SendEmailOutputSchema = z.object( {
  sent: z.boolean(),
  messageId: z.string()
} );

export const sendEmail = step( {
  name: 'sendEmail',
  inputSchema: SendEmailInputSchema,
  outputSchema: SendEmailOutputSchema,
  fn: async ( input ) => {
    const { to, subject, body } = input;
    const result = await emailService.send( { to, subject, body } );
    return { sent: true, messageId: result.id };
  }
} );
```

### After: types.ts (Shared Types)

```typescript
import { z } from '@outputai/core';

export const UserSchema = z.object( {
  id: z.string(),
  name: z.string(),
  email: z.string()
} );

export type User = z.infer<typeof UserSchema>;
```

## Calling Steps from Workflows

Steps are called with a single input object:

```typescript
// Flow SDK (direct parameters)
const user = await fetchUser( userId );
const greeting = await generateGreeting( user, 'formal' );

// Output SDK (object parameter)
const user = await fetchUser( { userId } );
const greeting = await generateGreeting( { user, style: 'formal' } );
```

## Common Pitfalls

### 1. Forgetting to Destructure Input

```typescript
// WRONG
fn: async ( userId, name ) => { ... }

// CORRECT
fn: async ( input ) => {
  const { userId, name } = input;
  ...
}
```

### 2. Missing File Extensions in Imports

```typescript
// WRONG
import { UserSchema } from './types';

// CORRECT
import { UserSchema } from './types.js';
```

### 3. Not Moving Types to types.ts

Keep schemas and types in `types.ts` for reuse across steps and workflows.

## Verification Steps

1. All activities converted to steps
2. Each step has inputSchema defined
3. Imports use `@outputai/core` for z
4. LLM calls use `generateText()` with `Output.object()` for structured output
5. File imports have `.js` extension

## Related Skills

- `flow-convert-workflow-definition` - Workflow conversion
- `flow-convert-prompts-to-files` - Prompt file creation
- `flow-error-zod-import` - Zod import issues
- `flow-error-eslint-compliance` - Code style compliance
