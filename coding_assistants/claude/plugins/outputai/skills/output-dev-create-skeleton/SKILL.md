---
name: output-dev-create-skeleton
description: Generate workflow skeleton files using the Output SDK CLI. Use when starting a new workflow, scaffolding project structure, or understanding the generated file layout.
allowed-tools: [Bash, Read]
---

# Generate Workflow Skeleton with Output SDK CLI

## Overview

This skill documents how to use the Output SDK CLI to generate a workflow skeleton. The skeleton provides a starting point with all required files and proper structure.

## When to Use This Skill

- Starting a new workflow from scratch
- Understanding what files are needed for a workflow
- Scaffolding the basic structure before implementation
- Learning the Output SDK workflow patterns

## CLI Command

```bash
npx output workflow generate --skeleton
```

This command creates the basic file structure for a new workflow.

## Generated File Structure

After running the skeleton generator, you will have:

```
src/workflows/{workflow-name}/
├── workflow.ts      # Main workflow definition
├── steps.ts         # Step function definitions
├── types.ts         # Zod schemas and types
├── prompts/         # Empty folder for prompt files
└── scenarios/       # Empty folder for test scenarios
```

## Project Structure Overview

The skeleton is created within the standard Output SDK project structure:

```
src/
├── shared/                      # Shared code (create if needed)
│   ├── clients/                 # API clients
│   ├── utils/                   # Utility functions
│   ├── services/                # Business logic services
│   ├── steps/                   # Shared steps (optional)
│   └── evaluators/              # Shared evaluators (optional)
└── workflows/
    └── {workflow-name}/         # Your new workflow
        ├── workflow.ts
        ├── steps.ts
        ├── types.ts
        ├── prompts/
        └── scenarios/
```

## Post-Generation Steps

### Step 1: Review Generated Files

After generation, review each file to understand the template structure:

**workflow.ts** - Contains a basic workflow template:
```typescript
import { workflow, z } from '@output.ai/core';
import { exampleStep } from './steps.js';
import { WorkflowInputSchema } from './types.js';

export default workflow({
  name: 'workflowName',
  description: 'Workflow description',
  inputSchema: WorkflowInputSchema,
  outputSchema: z.object({ result: z.string() }),
  fn: async (input) => {
    const result = await exampleStep(input);
    return { result };
  }
});
```

**steps.ts** - Contains example step template:
```typescript
import { step, z } from '@output.ai/core';
import { ExampleStepInputSchema } from './types.js';

export const exampleStep = step({
  name: 'exampleStep',
  description: 'Example step description',
  inputSchema: ExampleStepInputSchema,
  outputSchema: z.object({ result: z.string() }),
  fn: async (input) => {
    // Implement step logic here
    return { result: 'example' };
  }
});
```

**types.ts** - Contains schema definitions:
```typescript
import { z } from '@output.ai/core';

export const WorkflowInputSchema = z.object({
  // Define input fields
});

export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;
```

### Step 2: Customize the Workflow Name

1. Update the folder name to match your workflow
2. Update the `name` property in `workflow.ts`
3. Follow naming conventions:
   - Folder: `snake_case` (e.g., `image_processor`)
   - Workflow name: `camelCase` (e.g., `imageProcessor`)

### Step 3: Define Your Schemas

In `types.ts`, define your actual input/output schemas:

```typescript
import { z } from '@output.ai/core';

export const WorkflowInputSchema = z.object({
  content: z.string().describe('Content to process'),
  options: z.object({
    format: z.enum(['json', 'text']).default('json')
  }).optional()
});

export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;
export type WorkflowOutput = { processed: string };
```

**Related Skill**: `output-dev-types-file`

### Step 4: Implement Your Steps

Replace the example step with your actual step implementations:

```typescript
import { step, z, FatalError, ValidationError } from '@output.ai/core';
import { httpClient } from '@output.ai/http';
import { ProcessContentInputSchema } from './types.js';

export const processContent = step({
  name: 'processContent',
  description: 'Process the input content',
  inputSchema: ProcessContentInputSchema,
  outputSchema: z.object({ processed: z.string() }),
  fn: async ({ content }) => {
    // Implement your logic
    return { processed: content.toUpperCase() };
  }
});
```

**Related Skill**: `output-dev-step-function`

### Step 5: Update the Workflow

Wire up your steps in the workflow:

```typescript
import { workflow, z } from '@output.ai/core';
import { processContent } from './steps.js';
import { WorkflowInputSchema } from './types.js';

export default workflow({
  name: 'contentProcessor',
  description: 'Process content with custom logic',
  inputSchema: WorkflowInputSchema,
  outputSchema: z.object({ processed: z.string() }),
  fn: async (input) => {
    const result = await processContent({ content: input.content });
    return result;
  }
});
```

**Related Skill**: `output-dev-workflow-function`

### Step 6: Add Prompts (If Needed)

If your workflow uses LLM operations, create prompt files:

```
prompts/
└── analyzeContent@v1.prompt
```

**Related Skill**: `output-dev-prompt-file`

### Step 7: Create Test Scenarios

Add test input files to the scenarios folder:

```
scenarios/
├── basic_input.json
└── complex_input.json
```

**Related Skill**: `output-dev-scenario-file`

### Step 8: Set Up Shared Resources (If Needed)

If your workflow needs shared clients, utilities, or services:

```bash
# Create shared directories if they don't exist
mkdir -p src/shared/clients
mkdir -p src/shared/utils
mkdir -p src/shared/services
```

Import shared resources in your steps:
```typescript
import { GeminiService } from '../../shared/clients/gemini_client.js';
import { formatDate } from '../../shared/utils/date_helpers.js';
```

**Related Skill**: `output-dev-http-client-create`

## Verification

After customization, verify your workflow:

### 1. List Available Workflows

```bash
npx output workflow list
```

Your workflow should appear in the list.

### 2. Run with Test Input

```bash
npx output workflow run {workflowName} --input path/to/scenarios/basic_input.json
```

### 3. Check for Errors

Common issues after skeleton generation:
- Import paths missing `.js` extension
- Schema imported from `zod` instead of `@output.ai/core`
- Missing step exports

## Customization Tips

### Adding Multiple Steps

```typescript
// steps.ts
export const stepOne = step({ ... });
export const stepTwo = step({ ... });
export const stepThree = step({ ... });

// workflow.ts
const resultOne = await stepOne(input);
const resultTwo = await stepTwo(resultOne);
const resultThree = await stepThree(resultTwo);
```

### Parallel Step Execution

```typescript
// workflow.ts
const [resultA, resultB] = await Promise.all([
  stepA(input),
  stepB(input)
]);
```

### Conditional Steps

```typescript
// workflow.ts
if (input.processImages) {
  await processImages(input);
}
```

### Large Workflows - Folder-Based Organization

For workflows with many steps, use folder-based organization:

```
src/workflows/{workflow-name}/
├── workflow.ts
├── steps/               # Folder instead of single file
│   ├── fetch_data.ts
│   ├── process.ts
│   └── validate.ts
├── types.ts
└── ...
```

## Verification Checklist

After generating and customizing the skeleton:

- [ ] Workflow folder follows `snake_case` naming
- [ ] `workflow.ts` has correct name in camelCase
- [ ] All imports use `.js` extension
- [ ] `z` is imported from `@output.ai/core`
- [ ] Types are defined in `types.ts`
- [ ] Steps are defined in `steps.ts` or `steps/` folder
- [ ] At least one test scenario exists
- [ ] Workflow appears in `npx output workflow list`
- [ ] Shared resources (if any) are in `src/shared/`

## Related Skills

- `output-dev-folder-structure` - Understanding the complete folder layout
- `output-dev-workflow-function` - Detailed workflow.ts documentation
- `output-dev-step-function` - Detailed steps.ts documentation
- `output-dev-types-file` - Creating Zod schemas
- `output-dev-prompt-file` - Adding LLM prompts
- `output-dev-scenario-file` - Creating test scenarios
- `output-workflow-run` - Running workflows
- `output-workflow-list` - Listing available workflows
