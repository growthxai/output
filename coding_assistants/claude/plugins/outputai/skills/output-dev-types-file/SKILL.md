---
name: output-dev-types-file
description: Create types.ts files with Zod schemas for Output SDK workflows. Use when defining input/output schemas, creating type definitions, or fixing schema-related errors.
allowed-tools: [Read, Write, Edit]
---

# Creating types.ts Files with Zod Schemas

## Overview

This skill documents how to create `types.ts` files for Output SDK workflows. These files contain Zod schemas for input/output validation and their corresponding TypeScript types.

## When to Use This Skill

- Creating a new workflow's type definitions
- Adding new schemas for steps
- Fixing schema validation errors
- Refactoring existing type definitions

## Critical Import Rule

**ALWAYS** import `z` from `@outputai/core`, **NEVER** from `zod` directly:

```typescript
// CORRECT
import { z } from '@outputai/core';

// WRONG - will cause runtime errors
import { z } from 'zod';
```

**Related Skill**: `output-error-zod-import` for troubleshooting import issues

## Basic Structure

```typescript
import { z } from '@outputai/core';

// 1. Workflow Input Schema
export const WorkflowInputSchema = z.object({
  // Define input fields
});

// 2. Workflow Output Type
export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;
export type WorkflowOutput = /* output type */;

// 3. Step Schemas (for each step)
export const StepNameInputSchema = z.object({
  // Step input fields
});

export const StepNameOutputSchema = z.object({
  // Step output fields
});

// 4. Type Exports
export type StepNameInput = z.infer<typeof StepNameInputSchema>;
export type StepNameOutput = z.infer<typeof StepNameOutputSchema>;
```

## Common Schema Patterns

### Basic Types

```typescript
import { z } from '@outputai/core';

// Strings
const stringField = z.string();
const optionalString = z.string().optional();
const stringWithDefault = z.string().default('default value');
const describedString = z.string().describe('Field description');

// Numbers
const numberField = z.number();
const integerField = z.number().int();
const rangedNumber = z.number().min(1).max(100);

// Booleans
const booleanField = z.boolean();
const defaultBoolean = z.boolean().default(false);

// Enums
const enumField = z.enum(['option1', 'option2', 'option3']);
const enumWithDefault = z.enum(['small', 'medium', 'large']).default('medium');
```

### Complex Types

```typescript
import { z } from '@outputai/core';

// Arrays
const stringArray = z.array(z.string());
const objectArray = z.array(z.object({ id: z.string(), name: z.string() }));

// Objects
const nestedObject = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email()
  }),
  settings: z.object({
    notifications: z.boolean()
  })
});

// Union Types
const flexibleInput = z.union([
  z.string(),
  z.array(z.string())
]);

// Records
const keyValueMap = z.record(z.string(), z.number());
```

### Validation Patterns

```typescript
import { z } from '@outputai/core';

// String Validations
const emailField = z.string().email();
const urlField = z.string().url();
const uuidField = z.string().uuid();
const minLengthString = z.string().min(1);
const maxLengthString = z.string().max(1000);

// Number Validations
const positiveNumber = z.number().positive();
const nonNegativeNumber = z.number().nonnegative();
const percentageNumber = z.number().min(0).max(100);

// Array Validations
const nonEmptyArray = z.array(z.string()).min(1);
const limitedArray = z.array(z.string()).max(10);
```

### Schema Constraints for LLM Output

**Important**: Schemas passed to `Output.object()` (sent to LLM providers) must NOT use `.min()/.max()` on `z.number()`. Anthropic rejects `minimum`/`maximum` JSON Schema constraints. Use `.describe()` instead to guide the LLM on expected ranges.

```typescript
// Schema for Output.object() (sent to LLM) - use .describe() only
const llmOutputSchema = z.object({
  score: z.number().describe('Quality score 0-100'),
  confidence: z.number().describe('Confidence 0-1')
});

// Schema for workflow/step input/output (Zod validation only) - .min()/.max() OK
const workflowOutputSchema = z.object({
  score: z.number().min(0).max(100).describe('Quality score 0-100'),
  confidence: z.number().min(0).max(1).describe('Confidence 0-1')
});
```

## Complete Example

Based on a real workflow (`image_infographic_nano`):

```typescript
import { z } from '@outputai/core';

// ============================================
// Workflow Schemas
// ============================================

export const WorkflowInputSchema = z.object({
  content: z.string().describe('Text content to generate image ideas from'),
  mode: z.enum(['infographic']).default('infographic').describe('Type of image to generate'),
  colorPalette: z.string().optional().describe('Color palette preference for the images'),
  artDirection: z.string().optional().describe('Art direction or style preference'),
  numberOfIdeas: z.number().min(1).max(10).default(1).describe('Number of image concepts to generate'),
  referenceImageUrls: z.union([
    z.string(),
    z.array(z.string())
  ]).optional().describe('Reference image URLs for style guidance (max 14)'),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).default('1:1').describe('Aspect ratio for generated images'),
  resolution: z.enum(['1K', '2K', '4K']).default('1K').describe('Resolution for generated images'),
  numberOfGenerations: z.number().min(1).max(10).default(1).describe('Number of images to generate per concept'),
  storageNamespace: z.string().optional().describe('S3 folder path for storing images')
});

export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;
export type WorkflowOutput = string[];

// ============================================
// Step Schemas
// ============================================

export const ValidateReferenceImagesInputSchema = z.object({
  referenceImageUrls: z.array(z.string()).optional()
});

export const GenerateImageIdeasInputSchema = z.object({
  content: z.string(),
  numberOfIdeas: z.number(),
  colorPalette: z.string().optional(),
  artDirection: z.string().optional()
});

export const GenerateImagesInputSchema = z.object({
  input: z.object({
    referenceImageUrls: z.union([z.string(), z.array(z.string())]).optional(),
    aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']),
    resolution: z.enum(['1K', '2K', '4K']),
    numberOfGenerations: z.number(),
    storageNamespace: z.string().optional()
  }),
  prompt: z.string()
});

// Schema for LLM response validation
export const ImageIdeasSchema = z.object({
  ideas: z.array(z.string()).describe('Array of detailed image prompts for Gemini')
});

// ============================================
// Type Exports
// ============================================

export type ValidateReferenceImagesInput = z.infer<typeof ValidateReferenceImagesInputSchema>;
export type GenerateImageIdeasInput = z.infer<typeof GenerateImageIdeasInputSchema>;
export type GenerateImagesInput = z.infer<typeof GenerateImagesInputSchema>;
export type ImageIdeas = z.infer<typeof ImageIdeasSchema>;
```

## Best Practices

### 1. Use Descriptive Field Descriptions
```typescript
// Good - helps with documentation and error messages
z.string().describe('User email address for notifications')

// Avoid - no context for errors
z.string()
```

### 2. Provide Sensible Defaults
```typescript
// Good - workflow works without optional fields
numberOfIdeas: z.number().min(1).max(10).default(1)

// Avoid - forces users to provide every field
numberOfIdeas: z.number().min(1).max(10)
```

### 3. Separate Workflow and Step Schemas
```typescript
// Workflow input schema (what the user provides)
export const WorkflowInputSchema = z.object({ ... });

// Step schemas (internal data shapes)
export const StepNameInputSchema = z.object({ ... });
```

### 4. Export Both Schemas and Types
```typescript
// Export schema for runtime validation
export const UserSchema = z.object({ ... });

// Export type for TypeScript type checking
export type User = z.infer<typeof UserSchema>;
```

## Verification Checklist

- [ ] `z` is imported from `@outputai/core`
- [ ] WorkflowInputSchema is defined and exported
- [ ] WorkflowInput type is exported
- [ ] WorkflowOutput type is defined
- [ ] Each step has corresponding input/output schemas
- [ ] All schemas have `.describe()` for important fields
- [ ] Optional fields use `.optional()` or `.default()`
- [ ] Numeric fields have appropriate min/max constraints

## Related Skills

- `output-dev-workflow-function` - Using schemas in workflow definitions
- `output-dev-step-function` - Using schemas in step definitions
- `output-dev-evaluator-function` - Using schemas in evaluator definitions
- `output-dev-folder-structure` - Where types.ts belongs in the project
- `output-error-zod-import` - Troubleshooting schema import issues
