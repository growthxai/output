---
name: output-workflow-result
description: Get the result of an Output SDK workflow execution. Use when retrieving the output of a completed workflow, getting the return value, or checking what a workflow produced after async execution.
allowed-tools: [Bash]
---

# Get Workflow Execution Result

## Overview

This skill retrieves the result (return value) of a completed workflow execution. Use it after a workflow started with `npx output workflow start` has completed, or to retrieve results from historical runs.

## When to Use This Skill

- Getting output from an asynchronously started workflow
- Retrieving results from a completed workflow
- Checking what a workflow produced
- Processing workflow output in scripts
- Comparing results between runs

## Prerequisites

- The workflow must have completed (status: COMPLETED)
- You need the workflow ID
- For FAILED workflows, use `npx output workflow debug` instead

## Instructions

### Get Result

```bash
npx output workflow result <workflowId>
```

The result is the return value of the workflow function, typically JSON.

### Check Status First

Before getting results, verify the workflow completed:

```bash
npx output workflow status <workflowId>
# Should show: COMPLETED

npx output workflow result <workflowId>
```

## Understanding Results

### Success Results

A successful workflow returns the value from its `fn` function:

```typescript
// Workflow code
export default workflow({
  fn: async (input) => {
    return { processed: true, count: 42 };
  }
});
```

```bash
# Result output
npx output workflow result abc123
# { "processed": true, "count": 42 }
```

### Error Results

If you try to get the result of a failed workflow:
- You'll get an error message
- Use `npx output workflow debug` instead to see what went wrong

### No Result (void workflows)

Some workflows don't return a value:
```bash
npx output workflow result abc123
# null
```

## Examples

**Scenario**: Get result after async start

```bash
# Start workflow
npx output workflow start calculate '{"values": [1, 2, 3]}'
# Output: Workflow ID: calc-abc123

# Wait for completion
npx output workflow status calc-abc123
# Status: COMPLETED

# Get the result
npx output workflow result calc-abc123
# { "sum": 6, "average": 2 }
```

**Scenario**: Process result with jq

```bash
# Extract specific field
npx output workflow result abc123 | jq '.total'

# Format for display
npx output workflow result abc123 | jq '.'

# Save to file
npx output workflow result abc123 > result.json
```

**Scenario**: Compare results between runs

```bash
# Get results from two runs
npx output workflow result run-1-abc > result1.json
npx output workflow result run-2-xyz > result2.json

# Compare
diff result1.json result2.json
```

**Scenario**: Use in a script

```bash
WORKFLOW_ID="abc123"

# Wait for completion
while [[ $(npx output workflow status $WORKFLOW_ID) == *"RUNNING"* ]]; do
  sleep 5
done

# Check if completed successfully
if [[ $(npx output workflow status $WORKFLOW_ID) == *"COMPLETED"* ]]; then
  RESULT=$(npx output workflow result $WORKFLOW_ID)
  echo "Workflow result: $RESULT"
else
  echo "Workflow did not complete successfully"
  npx output workflow debug $WORKFLOW_ID
fi
```

## Handling Different Result Types

### JSON Objects
```bash
npx output workflow result abc123
# { "key": "value", "nested": { "data": true } }
```

### Arrays
```bash
npx output workflow result abc123
# [1, 2, 3, 4, 5]
```

### Primitive Values
```bash
npx output workflow result abc123
# 42

npx output workflow result abc123
# "success"

npx output workflow result abc123
# true
```

### Large Results

For large results, redirect to a file:
```bash
npx output workflow result abc123 > large-result.json
```

## Error Handling

### "Workflow not found"
- Check the workflow ID is correct
- Use `npx output workflow runs list` to find valid IDs

### "Workflow not completed"
- Check status: `npx output workflow status <id>`
- Wait for COMPLETED status before getting result
- If RUNNING, wait and try again
- If FAILED, use `npx output workflow debug`

### "No result available"
- The workflow may return void/undefined
- Check the workflow code to see what it returns

## Related Commands

- `npx output workflow status <id>` - Check if workflow completed
- `npx output workflow debug <id>` - Debug failed workflows
- `npx output workflow run <name>` - Run and get result in one step
- `npx output workflow runs list` - Find workflow IDs
