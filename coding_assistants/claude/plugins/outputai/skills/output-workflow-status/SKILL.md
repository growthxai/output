---
name: output-workflow-status
description: Check the status of an Output SDK workflow execution. Use when monitoring a running workflow, checking if a workflow completed, or determining workflow state (RUNNING, COMPLETED, FAILED, TERMINATED).
allowed-tools: [Bash]
---

# Check Workflow Execution Status

## Overview

This skill checks the current execution status of a workflow. Use it to monitor running workflows, verify completion, or determine if a workflow failed before attempting to get its result.

## When to Use This Skill

- Monitoring a workflow started asynchronously
- Checking if a workflow has completed
- Determining why you can't get a workflow result
- Verifying workflow state before taking action
- Polling for completion in scripts

## When to Use Other Commands

- **Getting results**: Use `npx output workflow result` after confirming COMPLETED status
- **Debugging failures**: Use `npx output workflow debug` for FAILED workflows
- **Execution history**: Use `npx output workflow runs list` for multiple runs

## Instructions

### Check Status

```bash
npx output workflow status <workflowId>
```

Replace `<workflowId>` with the ID from `npx output workflow start` or `npx output workflow runs list`.

## Understanding Status Values

| Status | Meaning | Next Action |
|--------|---------|-------------|
| RUNNING | Workflow is currently executing | Wait and check again |
| COMPLETED | Workflow finished successfully | Get result with `npx output workflow result` |
| FAILED | Workflow encountered an error | Debug with `npx output workflow debug` |
| TERMINATED | Workflow was manually stopped | Review if expected, restart if needed |
| TIMED_OUT | Workflow exceeded time limit | Check for long operations, adjust timeout |

## Examples

**Scenario**: Monitor a running workflow

```bash
# Start a workflow
npx output workflow start data-sync '{"source": "external"}'
# Output: Workflow ID: sync-abc123

# Check status
npx output workflow status sync-abc123
# Output: Status: RUNNING

# Wait and check again
sleep 30
npx output workflow status sync-abc123
# Output: Status: COMPLETED
```

**Scenario**: Poll for completion in a script

```bash
WORKFLOW_ID="abc123xyz"

while true; do
  STATUS=$(npx output workflow status $WORKFLOW_ID)
  echo "Current status: $STATUS"

  if [[ "$STATUS" == *"COMPLETED"* ]]; then
    echo "Workflow completed!"
    npx output workflow result $WORKFLOW_ID
    break
  elif [[ "$STATUS" == *"FAILED"* ]]; then
    echo "Workflow failed!"
    npx output workflow debug $WORKFLOW_ID --format json
    break
  fi

  sleep 10
done
```

**Scenario**: Check before getting result

```bash
# Verify status first
npx output workflow status my-workflow-123

# If COMPLETED, get result
npx output workflow result my-workflow-123

# If FAILED, debug instead
npx output workflow debug my-workflow-123 --format json
```

**Scenario**: Batch status check

```bash
# Check multiple workflows
for id in abc123 def456 ghi789; do
  echo "Workflow $id: $(npx output workflow status $id)"
done
```

## Status Transitions

Workflows typically follow these paths:

```
RUNNING -> COMPLETED (success)
RUNNING -> FAILED (error occurred)
RUNNING -> TERMINATED (manually stopped)
RUNNING -> TIMED_OUT (exceeded limit)
```

## Interpreting Status Output

The status command returns information including:
- **Status**: Current state (RUNNING, COMPLETED, FAILED, etc.)
- **Duration**: How long the workflow has been running or ran
- **Start Time**: When the workflow began

## Troubleshooting

### "Workflow not found"
- The workflow ID may be incorrect
- The workflow may have been deleted from history
- Check `npx output workflow runs list` to find the correct ID

### Status stays RUNNING too long
1. Check if the workflow is stuck: `npx output workflow debug <id>`
2. Look for infinite loops or waiting operations
3. Consider stopping: `npx output workflow stop <id>`

### Unexpected TERMINATED status
- Someone may have manually stopped the workflow
- Check with `npx output workflow debug` for context
- Restart if needed: `npx output workflow start`

## Related Commands

- `npx output workflow result <id>` - Get execution result (after COMPLETED)
- `npx output workflow debug <id>` - Debug execution (after FAILED)
- `npx output workflow stop <id>` - Stop a running workflow
- `npx output workflow runs list` - View execution history
