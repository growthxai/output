---
name: flow-convert-workflow-definition
description: Convert Flow SDK workflow class to Output SDK workflow() function. Use when migrating workflow.ts files from class-based to functional definitions.
allowed-tools: [Bash, Read, Write, Grep, Edit]
---

# Convert Flow Workflow Definition to Output SDK

## Overview

This skill guides the conversion of Flow SDK workflow classes to Output SDK functional workflow definitions. Workflows orchestrate step execution and define the overall data flow.

## When to Use This Skill

**During Migration:**
- Converting `workflow.ts` from class-based to functional
- Setting up workflow input/output schemas
- Updating step invocation patterns

## Key Differences

| Aspect | Flow SDK | Output SDK |
|--------|----------|------------|
| Definition | Class with execute() method | `workflow()` function |
| Input/Output | TypeScript interfaces | Zod schemas |
| Activity Calls | Direct function calls | Step calls with object params |
| Error Handling | Try-catch blocks | Let errors propagate |
| Imports | @flow/sdk | @output.ai/core |

## Conversion Pattern

### Flow SDK Workflow (Before)

```typescript
// workflow.ts
import { Workflow, WorkflowScope } from '@flow/sdk';
import { fetchUser, processData, saveResults } from './activities';

interface WorkflowInput {
  userId: string;
  processType: string;
}

interface WorkflowOutput {
  success: boolean;
  resultId: string;
}

export class DataProcessingWorkflow implements Workflow<WorkflowInput, WorkflowOutput> {
  async execute( input: WorkflowInput ): Promise<WorkflowOutput> {
    try {
      // Get user data
      const user = await fetchUser( input.userId );

      // Process the data
      const processed = await processData( user, input.processType );

      // Save results
      const result = await saveResults( processed );

      return {
        success: true,
        resultId: result.id
      };
    } catch ( error ) {
      throw new Error( `Workflow failed: ${error.message}` );
    }
  }
}
```

### Output SDK Workflow (After)

```typescript
// workflow.ts
import { workflow, z } from '@output.ai/core';
import { fetchUser, processData, saveResults } from './steps.js';

const WorkflowInputSchema = z.object( {
  userId: z.string(),
  processType: z.string()
} );

const WorkflowOutputSchema = z.object( {
  success: z.boolean(),
  resultId: z.string()
} );

export default workflow( {
  name: 'dataProcessing',
  description: 'Process user data and save results',
  inputSchema: WorkflowInputSchema,
  outputSchema: WorkflowOutputSchema,
  fn: async ( input ) => {
    // Get user data
    const user = await fetchUser( { userId: input.userId } );

    // Process the data
    const processed = await processData( { user, processType: input.processType } );

    // Save results
    const result = await saveResults( { data: processed } );

    return {
      success: true,
      resultId: result.id
    };
  }
} );
```

## Step-by-Step Conversion Process

### Step 1: Identify Workflow Class

Find the workflow class in `workflow.ts`:

```bash
grep -E "class.*Workflow" src/workflows/my-workflow/workflow.ts
```

### Step 2: Extract Input/Output Types

Convert TypeScript interfaces to Zod schemas:

```typescript
// Before: TypeScript interface
interface WorkflowInput {
  userId: string;
  count: number;
  options?: ProcessOptions;
}

// After: Zod schema
const WorkflowInputSchema = z.object( {
  userId: z.string(),
  count: z.number(),
  options: ProcessOptionsSchema.optional()
} );
```

### Step 3: Convert Class to Function

Replace class definition with `workflow()` call:

```typescript
// Before
export class MyWorkflow implements Workflow<Input, Output> {
  async execute( input: Input ): Promise<Output> {
    // ...
  }
}

// After
export default workflow( {
  name: 'myWorkflow',
  description: 'Description of what this workflow does',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  fn: async ( input ) => {
    // ...
  }
} );
```

### Step 4: Update Step Invocations

Change direct function calls to object parameter calls:

```typescript
// Before (Flow SDK)
const result = await someActivity( param1, param2, param3 );

// After (Output SDK)
const result = await someStep( { param1, param2, param3 } );
```

### Step 5: Remove Try-Catch Blocks

Remove error handling wrappers (see `flow-error-try-catch-removal`):

```typescript
// Before
async execute( input ) {
  try {
    const result = await doWork( input );
    return result;
  } catch ( error ) {
    throw new Error( error.message );
  }
}

// After
fn: async ( input ) => {
  const result = await doWork( { ...input } );
  return result;
}
```

### Step 6: Update Imports

```typescript
// Before
import { Workflow, WorkflowScope } from '@flow/sdk';
import { z } from 'zod';

// After
import { workflow, z } from '@output.ai/core';
```

## Important Conventions

### 1. Workflow Naming

The workflow name must match the legacy name if other systems depend on it:

```typescript
// Legacy system calls workflow by name 'userOnboarding'
export default workflow( {
  name: 'userOnboarding',  // Must match!
  // ...
} );
```

### 2. Default Export

Workflows should use `export default`:

```typescript
// CORRECT
export default workflow( { ... } );

// WRONG
export const myWorkflow = workflow( { ... } );
```

### 3. File Extension in Imports

Always include `.js` extension for local imports:

```typescript
import { fetchUser, processData } from './steps.js';
import { WorkflowInputSchema } from './types.js';
```

## Child Workflows

Workflows can invoke other workflows directly:

```typescript
// parent/workflow.ts
import { workflow, z } from '@output.ai/core';
import childWorkflow from '../child/workflow.js';

export default workflow( {
  name: 'parentWorkflow',
  inputSchema: z.object( { data: z.string() } ),
  outputSchema: z.object( { result: z.string() } ),
  fn: async ( input ) => {
    // Call child workflow like a step
    const childResult = await childWorkflow( { input: input.data } );

    return { result: childResult.output };
  }
} );
```

## Complete Migration Example

### Before: Flow SDK

```typescript
// workflow.ts
import { Workflow, WorkflowScope, FatalError } from '@flow/sdk';
import {
  validateInput,
  fetchUserProfile,
  generateReport,
  sendNotification
} from './activities';

interface ReportInput {
  userId: string;
  reportType: 'daily' | 'weekly' | 'monthly';
  includeCharts: boolean;
}

interface ReportOutput {
  reportId: string;
  downloadUrl: string;
  generatedAt: string;
}

export class GenerateReportWorkflow implements Workflow<ReportInput, ReportOutput> {
  async execute( input: ReportInput ): Promise<ReportOutput> {
    try {
      // Validate input
      const validated = await validateInput( input );

      // Fetch user profile
      const profile = await fetchUserProfile( input.userId );

      // Generate the report
      const report = await generateReport(
        profile,
        validated.reportType,
        validated.includeCharts
      );

      // Send notification
      await sendNotification( profile.email, report.id );

      return {
        reportId: report.id,
        downloadUrl: report.url,
        generatedAt: new Date().toISOString()
      };
    } catch ( error ) {
      throw new FatalError( `Report generation failed: ${error.message}` );
    }
  }
}
```

### After: Output SDK

```typescript
// workflow.ts
import { workflow, z } from '@output.ai/core';
import {
  validateInput,
  fetchUserProfile,
  generateReport,
  sendNotification
} from './steps.js';

const ReportInputSchema = z.object( {
  userId: z.string(),
  reportType: z.enum( [ 'daily', 'weekly', 'monthly' ] ),
  includeCharts: z.boolean()
} );

const ReportOutputSchema = z.object( {
  reportId: z.string(),
  downloadUrl: z.string(),
  generatedAt: z.string()
} );

export default workflow( {
  name: 'generateReport',
  description: 'Generate user reports with optional charts',
  inputSchema: ReportInputSchema,
  outputSchema: ReportOutputSchema,
  fn: async ( input ) => {
    // Validate input
    const validated = await validateInput( {
      userId: input.userId,
      reportType: input.reportType,
      includeCharts: input.includeCharts
    } );

    // Fetch user profile
    const profile = await fetchUserProfile( { userId: input.userId } );

    // Generate the report
    const report = await generateReport( {
      profile,
      reportType: validated.reportType,
      includeCharts: validated.includeCharts
    } );

    // Send notification
    await sendNotification( {
      email: profile.email,
      reportId: report.id
    } );

    return {
      reportId: report.id,
      downloadUrl: report.url,
      generatedAt: new Date().toISOString()
    };
  }
} );
```

## Verification Checklist

- [ ] Class converted to `workflow()` function
- [ ] Input/Output interfaces converted to Zod schemas
- [ ] Workflow name matches legacy name (if needed)
- [ ] Steps called with object parameters
- [ ] Try-catch blocks removed
- [ ] Imports use `@output.ai/core`
- [ ] File imports have `.js` extension
- [ ] `export default` used

## Related Skills

- `flow-convert-activities-to-steps` - Step conversion
- `flow-error-try-catch-removal` - Try-catch antipattern
- `flow-error-zod-import` - Zod import issues
- `flow-validation-checklist` - Complete validation
