---
name: output-workflow-list
description: List all available Output SDK workflows in the project. Use when discovering what workflows exist, checking workflow names, exploring the project's workflow structure, or when unsure which workflows are available to run.
allowed-tools: [Bash]
---

# List Available Workflows

## Overview

This skill helps you discover all available workflows in an Output SDK project. Workflows are the main execution units that orchestrate steps to accomplish tasks.

## When to Use This Skill

- Discovering what workflows exist in a project
- Verifying a workflow name before running it
- Exploring a new or unfamiliar codebase
- Checking if a specific workflow has been created
- Getting an overview of project capabilities

## Instructions

### List All Workflows

```bash
npx output workflow list
```

This command scans the project and displays all available workflows.

### Understanding the Output

The command outputs a table with workflow information:

| Column | Description |
|--------|-------------|
| Name | The workflow identifier used in commands |
| Description | Brief description of what the workflow does |
| Location | File path where the workflow is defined |

### Finding Workflow Files

Workflows are typically located in:
```
src/workflows/*/
```

Each workflow directory usually contains:
- `workflow.ts` or `index.ts` - The main workflow definition
- Step files - Individual steps used by the workflow
- Schema files - Input/output type definitions

### Inspecting a Workflow

After finding a workflow, you can examine its code:

```bash
# Read the workflow file
cat src/workflows/<workflowName>/workflow.ts

# Or examine the entire workflow directory
ls -la src/workflows/<workflowName>/
```

## Examples

**Scenario**: Discover available workflows in a project

```bash
npx output workflow list

# Example output:
# Name          Description                    Location
# -----------   ---------------------------    --------------------------------
# simple        Simple workflow example        src/workflows/simple/workflow.ts
# data-pipeline Process and transform data     src/workflows/data-pipeline/workflow.ts
# user-signup   Handle user registration       src/workflows/user-signup/workflow.ts
```

**Scenario**: Verify a workflow exists before running

```bash
# Check if "email-sender" workflow exists
npx output workflow list | grep email-sender

# If no output, the workflow doesn't exist
# If found, proceed with running it
npx output workflow run email-sender '{"to": "user@example.com"}'
```

**Scenario**: Explore workflow implementation

```bash
# List workflows
npx output workflow list

# Find the location and examine it
cat src/workflows/simple/workflow.ts
```

## Troubleshooting

### No workflows found
- Ensure you're in the project root directory
- Check that workflows are in `src/workflows/*/`
- Verify workflow files export a default workflow

### Workflow not showing
- Check the file exports a valid workflow definition
- Ensure the workflow file compiles without errors
- Run `npm run output:workflow:build` to check for TypeScript errors

## Related Commands

- `npx output workflow run <name>` - Execute a workflow synchronously
- `npx output workflow start <name>` - Start a workflow asynchronously
- `npx output workflow runs list` - View execution history
