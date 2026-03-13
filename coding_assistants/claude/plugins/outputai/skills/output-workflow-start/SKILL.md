---
name: output-workflow-start
description: Start an Output SDK workflow asynchronously without waiting for completion. Use when starting long-running workflows, getting a workflow ID for later monitoring, running workflows in the background, or executing multiple workflows in parallel.
allowed-tools: [Bash, Read, Write]
---

# Start Workflow Asynchronously

## Overview

This skill starts a workflow asynchronously, meaning the command returns immediately with a workflow ID while the workflow executes in the background. Use this for long-running workflows or when you need to run multiple workflows in parallel.

## When to Use This Skill

- Starting workflows that take minutes or hours
- Running multiple workflows in parallel
- When you need to disconnect and check results later
- Monitoring workflow progress separately
- When you need the workflow ID immediately for tracking

## When to Use Sync Instead

Consider using `npx output workflow run` (sync) when:
- Workflow completes quickly (seconds)
- You need the result immediately in your terminal
- Simple testing during development
- You want a single command with the result

## Instructions

### Basic Syntax

```bash
npx output workflow start <workflowName> --input '<json-input>'
npx output workflow start <workflowName> --input <path-to-json-file>
```

The `--input` flag is required when the workflow expects input data.

### Input Methods

#### 1. Inline JSON

Pass JSON directly on the command line:

```bash
npx output workflow start data-migration --input '{"batchSize": 1000}'
```

#### 2. File Path (Recommended)

Reference a JSON file containing the input:

```bash
npx output workflow start data-migration --input src/data_migration/scenarios/large_batch.json
```

This is the recommended approach because:
- Input is version controlled and reproducible
- Complex inputs are easier to read and edit
- Scenarios can be shared and reused

### Getting the Workflow ID

The command outputs the workflow ID which you'll need for:
- Checking status: `npx output workflow status <id>`
- Getting results: `npx output workflow result <id>`
- Debugging: `npx output workflow debug <id>`

## Examples

**Scenario**: Start a long-running workflow with scenario file

```bash
npx output workflow start data-migration --input src/data_migration/scenarios/full_migration.json

# Output:
# Started workflow: data-migration
# Workflow ID: abc123xyz
# Use 'npx output workflow status abc123xyz' to check progress
```

**Scenario**: Start multiple workflows in parallel using scenario files

```bash
# Start several workflows with different scenario files
npx output workflow start process-batch --input src/process_batch/scenarios/batch_1.json
npx output workflow start process-batch --input src/process_batch/scenarios/batch_2.json
npx output workflow start process-batch --input src/process_batch/scenarios/batch_3.json

# Note: Save the workflow IDs to check them later
```

**Scenario**: Create scenario then start workflow

```bash
# Create a scenario file
mkdir -p src/generate_report/scenarios
cat > src/generate_report/scenarios/annual_2024.json << 'EOF'
{
  "year": 2024,
  "includeCharts": true,
  "format": "pdf"
}
EOF

# Start the workflow
npx output workflow start generate-report --input src/generate_report/scenarios/annual_2024.json
# Output: Workflow ID: report-2024-abc

# Check status periodically
npx output workflow status report-2024-abc
# Output: Status: RUNNING

# Later, check again
npx output workflow status report-2024-abc
# Output: Status: COMPLETED

# Get the result
npx output workflow result report-2024-abc
```

**Scenario**: Quick inline test for development

```bash
npx output workflow start quick-job --input '{"test": true}'
```

**Scenario**: Script for parallel execution

```bash
# Start workflows and capture IDs
ID1=$(npx output workflow start job --input src/job/scenarios/type_a.json | grep "Workflow ID" | cut -d: -f2 | tr -d ' ')
ID2=$(npx output workflow start job --input src/job/scenarios/type_b.json | grep "Workflow ID" | cut -d: -f2 | tr -d ' ')

# Wait and check results
npx output workflow result $ID1
npx output workflow result $ID2
```

## Following Up After Starting

### Check Status

```bash
npx output workflow status <workflowId>
```

Status values:
- **RUNNING**: Still executing
- **COMPLETED**: Finished successfully
- **FAILED**: Encountered an error
- **TERMINATED**: Was manually stopped

### Get Result

```bash
npx output workflow result <workflowId>
```

Only works for COMPLETED workflows. For FAILED workflows, use debug.

### Debug If Failed

```bash
npx output workflow debug <workflowId> --format json
```

### Stop If Needed

```bash
npx output workflow stop <workflowId>
```

## Workflow ID Management

When starting multiple workflows, keep track of IDs:

```bash
# Log IDs to a file
npx output workflow start batch-job --input src/batch_job/scenarios/id_1.json >> workflow-ids.txt
npx output workflow start batch-job --input src/batch_job/scenarios/id_2.json >> workflow-ids.txt

# Or use a naming convention in your workflow that makes IDs predictable
```

## Best Practices

1. **Use scenario files**: Store inputs in `src/<workflow>/scenarios/` for reproducibility
2. **Save the workflow ID**: Always note the ID for later reference
3. **Monitor long workflows**: Use `npx output workflow status` to check progress
4. **Handle failures**: Check status before getting results
5. **Clean up**: Stop any stuck workflows with `npx output workflow stop`

## Related Commands

- `npx output workflow run <name> --input` - Execute synchronously
- `npx output workflow status <id>` - Check execution status
- `npx output workflow result <id>` - Get execution result
- `npx output workflow stop <id>` - Stop a running workflow
- `npx output workflow debug <id>` - Debug a workflow execution
