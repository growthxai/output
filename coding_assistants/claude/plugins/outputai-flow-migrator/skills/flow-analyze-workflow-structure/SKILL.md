---
name: flow-analyze-workflow-structure
description: Analyze Flow SDK workflow structure before migration. Use to map inputs, outputs, steps, control flow, and dependencies.
allowed-tools: [Bash, Read, Grep, Glob]
---

# Analyze Flow SDK Workflow Structure

## Overview

This skill helps analyze a Flow SDK workflow before migration to understand its structure, dependencies, and conversion requirements. This is the first step in any migration.

## When to Use This Skill

**Before Migration:**
- Starting migration of a new workflow
- Creating a migration plan
- Understanding workflow complexity

**During Migration:**
- Verifying all components are converted
- Checking for missed dependencies

## Flow SDK Workflow Structure

### Typical Folder Structure

```
src/workflows/my_workflow/
├── activities.ts      # Activity functions (→ steps.ts)
├── helpers.ts         # Optional helper functions
├── prompts.ts         # Prompt templates (→ .prompt files)
├── prompts.xml        # XML prompts (→ .prompt files)
├── readme.xml         # Workflow documentation
├── types.ts           # Type definitions (keep)
└── workflow.ts        # Workflow definition (convert)
```

### Key Files to Analyze

| File | Purpose | Migration Target |
|------|---------|------------------|
| `workflow.ts` | Workflow class | `workflow()` function |
| `activities.ts` | Activity functions | `steps.ts` |
| `types.ts` | Type definitions | Keep, add Zod schemas |
| `prompts.ts` | JS prompt arrays | `.prompt` files |
| `prompts.xml` | XML prompts | `.prompt` files |
| `readme.xml` | Documentation | Reference during migration |
| `helpers.ts` | Utility functions | Keep or inline |

## Analysis Process

### Step 1: List All Files

```bash
ls -la src/workflows/my_workflow/
```

### Step 2: Identify Workflow Entry Point

```bash
# Find the workflow class
grep -n "class.*Workflow" src/workflows/my_workflow/workflow.ts
grep -n "execute(" src/workflows/my_workflow/workflow.ts
```

### Step 3: Extract Input/Output Types

```bash
# Find interface definitions
grep -n "interface.*Input" src/workflows/my_workflow/*.ts
grep -n "interface.*Output" src/workflows/my_workflow/*.ts

# Find Zod schemas
grep -n "z.object" src/workflows/my_workflow/types.ts
```

### Step 4: List All Activities

```bash
# Find exported functions in activities.ts
grep -n "export.*async function" src/workflows/my_workflow/activities.ts
grep -n "export function" src/workflows/my_workflow/activities.ts
```

### Step 5: Map Activity Parameters

For each activity, note:
- Function name
- Parameters (types and count)
- Return type
- Dependencies (other activities, services)

```bash
# View activity signatures
grep -A5 "export.*function" src/workflows/my_workflow/activities.ts
```

### Step 6: Identify LLM Calls

```bash
# Find completion calls
grep -n "completion(" src/workflows/my_workflow/activities.ts
grep -n "await.*completion" src/workflows/my_workflow/activities.ts

# Find prompt usage
grep -n "Prompt" src/workflows/my_workflow/activities.ts
```

### Step 7: Map Control Flow

Read `workflow.ts` to understand:
- Sequential vs parallel execution
- Conditional logic
- Loop structures
- Error handling patterns

### Step 8: Identify External Dependencies

```bash
# Find external imports
grep -n "^import" src/workflows/my_workflow/*.ts | grep -v "\./"

# Find API calls
grep -n "fetch(" src/workflows/my_workflow/*.ts
grep -n "axios" src/workflows/my_workflow/*.ts
```

### Step 9: Check readme.xml for Context

```bash
cat src/workflows/my_workflow/readme.xml
```

## Analysis Output Template

Create a migration analysis document:

```markdown
# Workflow Migration Analysis: [workflow_name]

## Overview
- **Location**: src/workflows/my_workflow/
- **Purpose**: [from readme.xml]
- **Complexity**: [low/medium/high]

## Files to Migrate

| File | Status | Notes |
|------|--------|-------|
| workflow.ts | Needs conversion | Class → function |
| activities.ts | Needs conversion | 5 activities → steps |
| types.ts | Partial | Add Zod schemas |
| prompts.ts | Needs conversion | 3 prompts |

## Workflow Input/Output

### Input
```typescript
interface WorkflowInput {
  userId: string;
  options: ProcessOptions;
}
```

### Output
```typescript
interface WorkflowOutput {
  success: boolean;
  resultId: string;
}
```

## Activities (→ Steps)

| Activity | Parameters | Return Type | LLM Call |
|----------|------------|-------------|----------|
| fetchUser | userId: string | User | No |
| analyzeData | data: Data, options: Options | Analysis | Yes |
| saveResults | results: Results | SaveResult | No |

## Prompts

| Name | Location | Variables | Target File |
|------|----------|-----------|-------------|
| analyzePrompt | prompts.ts | data, options | analyze@v1.prompt |

## Control Flow

1. Fetch user data (sequential)
2. Analyze data (with conditional)
3. Save results (sequential)

## Dependencies

- External API: https://api.example.com
- Service: EmailService
- Helper: formatData()

## Migration Risks

- [ ] Complex conditional logic in workflow
- [ ] Custom error handling to review
- [ ] External service authentication

## Estimated Effort

- Steps: 5 activities to convert
- Prompts: 2 prompts to create
- Types: Add 3 Zod schemas
```

## Quick Analysis Commands

### Get workflow overview

```bash
# Count activities
grep -c "export.*function" src/workflows/my_workflow/activities.ts

# Count prompts
grep -c "role:" src/workflows/my_workflow/prompts.ts

# Check for Handlebars syntax
grep -c "{{#if" src/workflows/my_workflow/prompts.ts

# Check for zod imports (need conversion)
grep "from 'zod'" src/workflows/my_workflow/*.ts
```

### Generate activity list

```bash
grep "export.*function" src/workflows/my_workflow/activities.ts | \
  sed 's/export async function /- /' | \
  sed 's/export function /- /' | \
  sed 's/(.*//'
```

## Output SDK Target Structure

After migration, the folder should look like:

```
src/workflows/my_workflow/
├── workflow.ts           # Converted workflow() function
├── steps.ts              # Converted step() definitions
├── types.ts              # Types with Zod schemas
├── analyze@v1.prompt     # Converted prompts
├── summarize@v1.prompt
└── scenarios/            # NEW: Test scenarios
    └── basic_input.json
```

## Related Skills

- `flow-analyze-prompts` - Detailed prompt analysis
- `flow-convert-activities-to-steps` - Activity conversion
- `flow-convert-workflow-definition` - Workflow conversion
- `flow-conventions-folder-structure` - Target structure
