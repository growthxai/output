---
name: output-dev-step-function
description: Create step functions in steps.ts for Output SDK workflows. Use when implementing I/O operations, error handling, HTTP requests, or LLM calls.
allowed-tools: [Read, Write, Edit]
---

# Creating Step Functions

## Overview

This skill documents how to create step functions in `steps.ts` for Output SDK workflows. Steps are where all I/O operations happen - HTTP requests, LLM calls, database operations, file system access, etc.

## When to Use This Skill

- Implementing I/O operations for a workflow
- Adding HTTP client integrations
- Implementing LLM-powered steps
- Handling errors with FatalError and ValidationError
- Creating reusable step components

## File Organization

### Option 1: Flat File (Default)

For smaller workflows, use a single `steps.ts` file:

```
src/workflows/{workflow-name}/
├── workflow.ts
├── steps.ts         # All steps in one file
├── types.ts
└── ...
```

### Option 2: Folder-Based (Large workflows)

For larger workflows with many steps, use a `steps/` folder:

```
src/workflows/{workflow-name}/
├── workflow.ts
├── steps/           # Steps split into individual files
│   ├── fetch_data.ts
│   ├── process.ts
│   └── validate.ts
├── types.ts
└── ...
```

## Component Location Rules

**Important**: `step()` calls MUST be in files containing 'steps' in the path:
- `src/workflows/my_workflow/steps.ts` ✓
- `src/workflows/my_workflow/steps/fetch_data.ts` ✓
- `src/shared/steps/common_steps.ts` ✓
- `src/workflows/my_workflow/helpers.ts` ✗ (cannot contain step() calls)

## Activity Isolation Constraints

Steps are Temporal activities with strict import rules to ensure deterministic replay.

### Steps CAN import from:
- Local workflow files: `./utils.js`, `./types.js`, `./helpers.js`
- Local subdirectories: `./clients/pokeapi.js`, `./lib/helpers.js`
- Shared utilities: `../../shared/utils/*.js`
- Shared clients: `../../shared/clients/*.js`
- Shared services: `../../shared/services/*.js`

### Steps CANNOT import:
- Other step files (even shared steps - workflows import those)
- Evaluator files
- Workflow files

**Example of WRONG imports:**
```typescript
// WRONG - steps cannot import other steps
import { otherStep } from '../../shared/steps/other.js'; // ✗
import { anotherStep } from './other_steps.js'; // ✗
```

## Critical Import Patterns

### Core Imports

```typescript
// CORRECT - Import from @outputai/core
import { step, z, FatalError, ValidationError } from '@outputai/core';

// WRONG - Never import z from zod
import { z } from 'zod';
```

### HTTP Client Import

```typescript
// CORRECT - Use @outputai/http wrapper
import { httpClient } from '@outputai/http';

// WRONG - Never use axios directly
import axios from 'axios';
```

**Related Skill**: `output-error-http-client`

### LLM Client Import

```typescript
// CORRECT - Use @outputai/llm wrapper
import { generateText, Output } from '@outputai/llm';

// WRONG - Never call LLM providers directly
import OpenAI from 'openai';
```

### ES Module Imports

All imports MUST use `.js` extension:

```typescript
// CORRECT
import { InputSchema, OutputSchema } from './types.js';
import { GeminiService } from '../../shared/clients/gemini_client.js';

// WRONG - Missing .js extension
import { InputSchema, OutputSchema } from './types';
```

## Basic Structure

```typescript
import { step, z, FatalError, ValidationError } from '@outputai/core';
import { httpClient } from '@outputai/http';
import { generateText, Output } from '@outputai/llm';

import { StepInputSchema, StepOutputSchema } from './types.js';

export const myStep = step( {
  name: 'myStep',
  description: 'Description of what this step does',
  inputSchema: StepInputSchema,
  outputSchema: StepOutputSchema,
  fn: async input => {
    // Implementation with I/O operations
    return { /* output matching outputSchema */ };
  }
} );
```

## Required Properties

### name (string)
Unique identifier for the step. Use camelCase.

```typescript
name: 'generateImageIdeas'
```

### description (string)
Human-readable description of the step's purpose.

```typescript
description: 'Generate creative infographic prompt ideas using Claude'
```

### inputSchema (Zod schema)
Schema for validating step input. Define in `types.ts` and import.

```typescript
inputSchema: z.object( {
  content: z.string(),
  numberOfIdeas: z.number()
} )
```

### outputSchema (Zod schema)
Schema for validating step output. Define in `types.ts` and import.

```typescript
outputSchema: z.array( z.string() )
```

### fn (async function)
The step execution function. This is where I/O operations happen.

```typescript
fn: async input => {
  const result = await someExternalService( input );
  return result;
}
```

## HTTP Client Usage

### Creating an HTTP Client

```typescript
import { httpClient } from '@outputai/http';
import { FatalError, ValidationError } from '@outputai/core';

const RETRY_STATUS_CODES = [ 408, 429, 500, 502, 503, 504 ];
const FATAL_STATUS_CODES = [ 401, 403, 404 ];

const httpClientInstance = httpClient( {
  timeout: 30000,
  retry: {
    limit: 3,
    statusCodes: RETRY_STATUS_CODES
  },
  hooks: {
    beforeError: [
      error => {
        const status = error.response?.status;
        const message = error.message;

        if ( status && FATAL_STATUS_CODES.includes( status ) ) {
          throw new FatalError(
            `HTTP ${status} error: ${message}. This is a permanent error.`
          );
        }

        throw new ValidationError(
          `HTTP request failed: ${message}`
        );
      }
    ]
  }
} );
```

### Making HTTP Requests

```typescript
// GET request
const response = await httpClientInstance.get( 'https://api.example.com/data' );
const data = await response.json();

// POST request with JSON body
const response = await httpClientInstance.post( 'https://api.example.com/submit', {
  json: { field: 'value' }
} );

// HEAD request (check URL accessibility)
const response = await httpClientInstance.head( url );
const contentType = response.headers.get( 'content-type' );
```

**Related Skill**: `output-dev-http-client-create` for creating shared clients

## LLM Operations

### Important: Define LLM Schemas in types.ts

Schemas used in `Output.object()` **must** be defined in `types.ts` and imported -- never defined inline in step functions. Inline schemas lead to duplication, drift between the step's `outputSchema` and the LLM schema, and make it harder to maintain types.

```typescript
// WRONG - inline schema in Output.object()
output: Output.object( {
  schema: z.object( {
    analysis: z.string()
  } )
} )

// CORRECT - import from types.ts
import { AnalysisLlmSchema } from './types.js';
// ...
output: Output.object( {
  schema: AnalysisLlmSchema
} )
```

### Using generateText with Output.object()

```typescript
import { generateText, Output } from '@outputai/llm';
import {
  AnalyzeContentInputSchema,
  AnalyzeContentOutputSchema,
  AnalysisLlmSchema
} from './types.js';

export const analyzeContent = step( {
  name: 'analyzeContent',
  description: 'Analyze content using Claude',
  inputSchema: AnalyzeContentInputSchema,
  outputSchema: AnalyzeContentOutputSchema,
  fn: async ( { content } ) => {
    const { output } = await generateText( {
      prompt: 'analyzeContent@v1',
      variables: {
        content
      },
      output: Output.object( {
        schema: AnalysisLlmSchema
      } )
    } );

    return { analysis: output.analysis };
  }
} );
```

### Using generateText

```typescript
import { generateText } from '@outputai/llm';
import { SummarizeInputSchema, SummarizeOutputSchema } from './types.js';

export const generateSummary = step( {
  name: 'generateSummary',
  description: 'Generate a text summary',
  inputSchema: SummarizeInputSchema,
  outputSchema: SummarizeOutputSchema,
  fn: async ( { content } ) => {
    const { result } = await generateText( {
      prompt: 'summarize@v1',
      variables: { content }
    } );

    return { summary: result };
  }
} );
```

**Related Skill**: `output-dev-prompt-file` for creating prompt files

## Error Handling

### FatalError (Non-Retryable)

Use FatalError for permanent failures that should not be retried:

```typescript
import { FatalError } from '@outputai/core';

// Authentication failures
if ( response.status === 401 ) {
  throw new FatalError( 'Invalid API key' );
}

// Invalid input that cannot be fixed by retry
if ( !input.requiredField ) {
  throw new FatalError( 'Missing required field: requiredField' );
}

// Resource not found
if ( response.status === 404 ) {
  throw new FatalError( `Resource not found: ${resourceId}` );
}

// Configuration errors
if ( !process.env.API_KEY ) {
  throw new FatalError( 'API_KEY environment variable not set' );
}
```

### ValidationError (Retryable)

Use ValidationError for temporary failures that may succeed on retry:

```typescript
import { ValidationError } from '@outputai/core';

// Rate limiting
if ( response.status === 429 ) {
  throw new ValidationError( 'Rate limit exceeded, will retry' );
}

// Temporary service unavailability
if ( response.status === 503 ) {
  throw new ValidationError( 'Service temporarily unavailable' );
}

// Network errors
try {
  const response = await httpClientInstance.get( url );
} catch ( error ) {
  throw new ValidationError( `Network error: ${error.message}` );
}

// Empty response that might be temporary
if ( results.length === 0 ) {
  throw new ValidationError( 'No results returned, will retry' );
}
```

**Related Skill**: `output-error-try-catch` for proper error handling patterns

## Complete Example

Based on a real workflow step:

```typescript
import { step, z, FatalError, ValidationError } from '@outputai/core';
import { httpClient } from '@outputai/http';
import { generateText, Output } from '@outputai/llm';

import { GeminiImageService } from '../../shared/clients/gemini_client.js';
import {
  GenerateImageIdeasInputSchema,
  GenerateImagesInputSchema,
  ImageIdeasSchema
} from './types.js';

const RETRY_STATUS_CODES = [ 408, 429, 500, 502, 503, 504 ];
const FATAL_STATUS_CODES = [ 401, 403, 404 ];

const httpClientInstance = httpClient( {
  timeout: 30000,
  retry: {
    limit: 3,
    statusCodes: RETRY_STATUS_CODES
  },
  hooks: {
    beforeError: [
      error => {
        const status = error.response?.status;
        const message = error.message;

        if ( status && FATAL_STATUS_CODES.includes( status ) ) {
          throw new FatalError( `HTTP ${status} error: ${message}` );
        }

        throw new ValidationError( `HTTP request failed: ${message}` );
      }
    ]
  }
} );

// Step 1: Generate Ideas using LLM
export const generateImageIdeas = step( {
  name: 'generateImageIdeas',
  description: 'Generate creative infographic prompt ideas using Claude',
  inputSchema: GenerateImageIdeasInputSchema,
  outputSchema: z.array( z.string() ),
  fn: async ( { content, numberOfIdeas, colorPalette, artDirection } ) => {
    const { output } = await generateText( {
      prompt: 'generateImageIdeas@v1',
      variables: {
        content,
        numberOfIdeas,
        colorPalette: colorPalette || '',
        artDirection: artDirection || ''
      },
      output: Output.object( {
        schema: ImageIdeasSchema
      } )
    } );

    return output.ideas;
  }
} );

// Step 2: Generate Images using external API
export const generateImages = step( {
  name: 'generateImages',
  description: 'Generate images using Gemini API',
  inputSchema: GenerateImagesInputSchema,
  outputSchema: z.array( z.string() ),
  fn: async ( { input, prompt } ) => {
    const geminiImageService = new GeminiImageService();

    const generatedImages = await geminiImageService.generateImage( {
      prompt,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      numberOfImages: input.numberOfGenerations
    } );

    if ( generatedImages.length === 0 ) {
      throw new ValidationError( 'No images were generated by Gemini' );
    }

    return generatedImages;
  }
} );

// Step 3: Validate URLs using HTTP client
export const validateReferenceImages = step( {
  name: 'validateReferenceImages',
  description: 'Validates that all provided reference image URLs are accessible',
  inputSchema: z.object( {
    referenceImageUrls: z.array( z.string() ).optional()
  } ),
  outputSchema: z.boolean(),
  fn: async ( { referenceImageUrls } ) => {
    if ( !referenceImageUrls || referenceImageUrls.length === 0 ) {
      return true;
    }

    for ( const [ index, url ] of referenceImageUrls.entries() ) {
      const response = await httpClientInstance.head( url );
      const contentType = response.headers.get( 'content-type' );

      if ( contentType && !contentType.startsWith( 'image/' ) ) {
        throw new FatalError(
          `Reference URL ${index + 1} (${url}) is not an image file`
        );
      }
    }

    return true;
  }
} );
```

## Best Practices

### 1. One Responsibility Per Step

```typescript
// Good - focused step
export const fetchUserData = step( {
  name: 'fetchUserData',
  description: 'Fetch user data from the API'
  // ...
} );

// Avoid - step doing too much
export const fetchAndProcessAndSaveUserData = step( {
  name: 'fetchAndProcessAndSaveUserData'
  // ...
} );
```

### 2. Clear Error Messages

```typescript
// Good - specific error message
throw new FatalError( `Invalid API key for service: ${serviceName}` );

// Avoid - generic error message
throw new FatalError( 'Error occurred' );
```

### 3. Validate Input Early

```typescript
fn: async input => {
  if ( !input.url.startsWith( 'https://' ) ) {
    throw new FatalError( 'URL must use HTTPS protocol' );
  }

  const response = await httpClientInstance.get( input.url );
  // ...
}
```

## Verification Checklist

- [ ] `step`, `z`, `FatalError`, `ValidationError` imported from `@outputai/core`
- [ ] `httpClient` imported from `@outputai/http` (not axios)
- [ ] `generateText` and `Output` imported from `@outputai/llm` (not direct provider)
- [ ] Structured output uses `Output.object()` with `.describe()` (not `.min()/.max()/.length()`) on number and array schemas
- [ ] Schemas for `Output.object()` are defined in `types.ts` and imported, not inline
- [ ] All imports use `.js` extension
- [ ] Named exports used for each step
- [ ] Each step has `name`, `description`, `inputSchema`, `outputSchema`, `fn`
- [ ] FatalError used for non-retryable failures
- [ ] ValidationError used for retryable failures
- [ ] No bare try-catch blocks that swallow errors
- [ ] Steps only import allowed dependencies (local files, shared code)
- [ ] No imports of other steps, evaluators, or workflows
- [ ] Code follows style conventions (see `output-dev-code-style`)

## Related Skills

- `output-dev-workflow-function` - Orchestrating steps in workflow.ts
- `output-dev-evaluator-function` - Using steps in evaluator functions
- `output-dev-types-file` - Defining step input/output schemas
- `output-dev-code-style` - Code formatting and style conventions
- `output-dev-http-client-create` - Creating shared HTTP clients
- `output-dev-prompt-file` - Creating prompt files for LLM operations
- `output-error-try-catch` - Proper error handling patterns
- `output-error-direct-io` - Avoiding direct I/O in workflows
