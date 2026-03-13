---
name: output-dev-workflow-function
description: Create workflow.ts files for Output SDK workflows. Use when defining workflow functions, orchestrating steps, or fixing workflow structure issues.
allowed-tools: [Read, Write, Edit]
---

# Creating workflow.ts Files

## Overview

This skill documents how to create `workflow.ts` files for Output SDK workflows. The workflow file contains the main orchestration logic that coordinates step execution.

## When to Use This Skill

- Creating a new workflow's main definition
- Understanding workflow structure requirements
- Debugging workflow orchestration issues
- Refactoring existing workflow logic

## Critical Rules

### 1. Import Pattern

```typescript
// CORRECT - Import from @output.ai/core
import { workflow, z } from '@output.ai/core';

// WRONG - Never import z from zod
import { z } from 'zod';
```

### 2. ES Module Imports

All imports MUST use `.js` extension:

```typescript
// CORRECT
import { stepName } from './steps.js';
import { WorkflowInputSchema } from './types.js';

// WRONG - Missing .js extension
import { stepName } from './steps';
import { WorkflowInputSchema } from './types';
```

### 3. Determinism Requirement

**CRITICAL**: The workflow `fn` must be deterministic. No direct I/O operations are allowed in the workflow function.

```typescript
// WRONG - Direct I/O in workflow
export default workflow({
  // ...
  fn: async (input) => {
    const response = await fetch('https://api.example.com'); // NEVER do this!
    return response.json();
  }
});

// CORRECT - Delegate I/O to steps
export default workflow({
  // ...
  fn: async (input) => {
    const result = await fetchDataStep(input); // Steps handle I/O
    return result;
  }
});
```

**Related Skill**: `output-error-nondeterminism`

## Basic Structure

```typescript
import { workflow, z } from '@output.ai/core';

import { stepOne, stepTwo } from './steps.js';
import { WorkflowInputSchema, WorkflowOutput } from './types.js';

export default workflow({
  name: 'workflowName',
  description: 'Brief description of what the workflow does',
  inputSchema: WorkflowInputSchema,
  outputSchema: z.object({ /* output shape */ }),
  fn: async (input): Promise<WorkflowOutput> => {
    // Orchestrate step calls
    const result = await stepOne(input);
    const final = await stepTwo(result);
    return final;
  }
});
```

## Required Properties

### name (string)
Unique identifier for the workflow. Use camelCase.

```typescript
name: 'contentUtilsImageInfographicNano'
```

### description (string)
Human-readable description of the workflow's purpose.

```typescript
description: 'Generate high-quality infographic images using AI-powered ideation'
```

### inputSchema (Zod schema)
Schema for validating workflow input. Import from `types.ts`.

```typescript
inputSchema: WorkflowInputSchema
```

**Related Skill**: `output-dev-types-file`

### outputSchema (Zod schema)
Schema for validating workflow output.

```typescript
outputSchema: z.object({
  results: z.array(z.string()),
  metadata: z.object({
    processedAt: z.string()
  })
})
```

### fn (async function)
The workflow execution function. Must be deterministic.

```typescript
fn: async (input): Promise<WorkflowOutput> => {
  // Step orchestration only - no direct I/O
  const result = await processStep(input);
  return result;
}
```

## Complete Example

Based on a real workflow (`image_infographic_nano`):

```typescript
import { workflow, z } from '@output.ai/core';

import {
  generateImageIdeas,
  generateImages,
  validateReferenceImages
} from './steps.js';
import {
  WorkflowInput,
  WorkflowInputSchema,
  WorkflowOutput
} from './types.js';
import { normalizeReferenceImageUrls } from './utils.js';

export default workflow({
  name: 'contentUtilsImageInfographicNano',
  description: 'Generate high-quality infographic images using Google Gemini 3 Pro Image model with AI-powered ideation',
  inputSchema: WorkflowInputSchema,
  outputSchema: z.array(z.string()),
  fn: async (rawInput: WorkflowInput): Promise<WorkflowOutput> => {
    // Pre-process input (pure function - OK in workflow)
    const input = {
      ...rawInput,
      referenceImageUrls: normalizeReferenceImageUrls(rawInput.referenceImageUrls)
    };

    // Conditional step execution
    if (input.referenceImageUrls && input.referenceImageUrls.length > 0) {
      await validateReferenceImages({
        referenceImageUrls: input.referenceImageUrls as string[]
      });
    }

    // Sequential step execution
    const ideas = await generateImageIdeas({
      content: input.content,
      numberOfIdeas: input.numberOfIdeas,
      colorPalette: input.colorPalette,
      artDirection: input.artDirection
    });

    // Parallel step execution
    const generations = await Promise.all(
      ideas.map(idea =>
        generateImages({
          input: {
            referenceImageUrls: input.referenceImageUrls,
            aspectRatio: input.aspectRatio,
            resolution: input.resolution,
            numberOfGenerations: input.numberOfGenerations,
            storageNamespace: input.storageNamespace
          },
          prompt: idea
        })
      )
    );

    return generations.flat();
  }
});
```

## Orchestration Patterns

### Sequential Execution

Execute steps one after another:

```typescript
fn: async (input) => {
  const step1Result = await stepOne(input);
  const step2Result = await stepTwo(step1Result);
  const step3Result = await stepThree(step2Result);
  return step3Result;
}
```

### Parallel Execution

Execute independent steps concurrently:

```typescript
fn: async (input) => {
  const [resultA, resultB, resultC] = await Promise.all([
    stepA(input),
    stepB(input),
    stepC(input)
  ]);
  return { resultA, resultB, resultC };
}
```

### Conditional Execution

Execute steps based on conditions:

```typescript
fn: async (input) => {
  if (input.includeImages) {
    await processImages(input);
  }

  const result = input.mode === 'fast'
    ? await quickProcess(input)
    : await detailedProcess(input);

  return result;
}
```

### Fan-Out Pattern

Process multiple items in parallel:

```typescript
fn: async (input) => {
  const results = await Promise.all(
    input.items.map(item => processItem({ item }))
  );
  return { processedItems: results };
}
```

### Pipeline Pattern

Chain multiple transformations:

```typescript
fn: async (input) => {
  const extracted = await extractData(input);
  const transformed = await transformData(extracted);
  const validated = await validateData(transformed);
  const enriched = await enrichData(validated);
  return enriched;
}
```

## What is Allowed in Workflow fn

### Allowed (Deterministic Operations)
- Calling step functions
- Pure data transformations
- Conditional logic based on input
- Array operations (map, filter, reduce)
- Object destructuring and construction
- Promise.all for parallel steps
- Control flow (if/else, loops)

### NOT Allowed (Non-Deterministic Operations)
- HTTP requests (use steps)
- Database queries (use steps)
- File system operations (use steps)
- Random number generation
- Current date/time access
- Environment variable access
- Any external service calls

## Verification Checklist

- [ ] `workflow` and `z` imported from `@output.ai/core`
- [ ] All imports use `.js` extension
- [ ] Default export used for the workflow
- [ ] `name` is camelCase and unique
- [ ] `description` clearly explains the workflow
- [ ] `inputSchema` imported from `types.ts`
- [ ] `outputSchema` matches actual return type
- [ ] `fn` is deterministic (no direct I/O)
- [ ] All I/O delegated to step functions

## Related Skills

- `output-dev-step-function` - Creating step functions that handle I/O
- `output-dev-evaluator-function` - Using steps in evaluator functions
- `output-dev-types-file` - Defining input/output schemas
- `output-dev-folder-structure` - Where workflow.ts belongs
- `output-error-nondeterminism` - Fixing determinism violations
- `output-error-zod-import` - Fixing schema import issues
