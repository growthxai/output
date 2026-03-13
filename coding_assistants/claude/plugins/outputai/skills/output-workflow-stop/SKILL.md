---
name: output-workflow-stop
description: Stop a running Output SDK workflow execution. Use when cancelling a workflow, stopping a long-running process, terminating a stuck workflow, or when you need to abort a workflow in progress.
allowed-tools: [Bash]
---

# Stop Running Workflow

## Overview

This skill stops a running workflow execution. The workflow will be marked as TERMINATED and will not complete its remaining steps. Use this carefully as it cannot be undone.

## When to Use This Skill

- Cancelling a workflow that's no longer needed
- Stopping a workflow that appears stuck
- Terminating a long-running workflow to free resources
- Aborting a workflow with incorrect input
- Emergency stop during unexpected behavior

## When NOT to Use This

- If the workflow is about to complete (let it finish)
- If you're unsure whether stopping is safe
- For debugging (use `npx output workflow debug` instead)
- If the workflow has side effects that may leave data in an inconsistent state

## Instructions

### Stop a Workflow

```bash
npx output workflow stop <workflowId>
```

### Safety Considerations

Before stopping, consider:

1. **Side effects**: Has the workflow made changes that need to be rolled back?
2. **Partial completion**: Are there steps that completed with side effects?
3. **Dependencies**: Are other workflows or systems waiting on this result?
4. **Recovery**: Do you need to restart or clean up after stopping?

## Examples

**Scenario**: Stop a stuck workflow

```bash
# Check status - workflow has been running too long
npx output workflow status abc123xyz
# Status: RUNNING (for 2 hours)

# Decide to stop it
npx output workflow stop abc123xyz
# Workflow abc123xyz has been stopped

# Verify it's terminated
npx output workflow status abc123xyz
# Status: TERMINATED
```

**Scenario**: Cancel a workflow started with wrong input

```bash
# Realized input was wrong immediately after starting
npx output workflow start expensive-job '{"wrong": "input"}'
# Workflow ID: job-abc123

# Stop before it processes too much
npx output workflow stop job-abc123

# Start again with correct input
npx output workflow start expensive-job '{"correct": "input"}'
```

**Scenario**: Stop multiple workflows

```bash
# Get list of running workflows
npx output workflow runs list --format json | jq '.[] | select(.status == "RUNNING") | .workflowId'

# Stop each one (carefully review first!)
for id in abc123 def456; do
  echo "Stopping $id"
  npx output workflow stop $id
done
```

## After Stopping a Workflow

### Check the State

```bash
npx output workflow status <workflowId>
# Status: TERMINATED
```

### Review What Happened

```bash
npx output workflow debug <workflowId> --format json
```

This shows:
- Which steps completed before termination
- Any partial results or side effects
- The point at which the workflow was stopped

### Clean Up If Needed

If the workflow made partial changes:
1. Review the debug output to see what completed
2. Manually revert any side effects if necessary
3. Consider creating a cleanup workflow for this scenario

### Restart If Appropriate

```bash
# Start a fresh execution
npx output workflow start <workflowName> '<input>'
```

## What Happens When You Stop

1. The Temporal server receives the termination request
2. The currently executing step may complete or abort
3. No further steps are executed
4. The workflow status changes to TERMINATED
5. The result will not be available (workflow didn't complete)

## Troubleshooting

### "Workflow not found"
- Check the workflow ID is correct
- Use `npx output workflow runs list` to find valid IDs

### "Workflow already completed"
- The workflow finished before the stop command
- Check status and get result if needed

### "Workflow already terminated"
- The workflow was already stopped
- No action needed

### Stop command hangs
- The Temporal server may be unresponsive
- Check if services are running: `docker ps | grep output`
- May need to restart services

## Best Practices

1. **Always check status first**: Confirm the workflow is actually RUNNING
2. **Review before stopping**: Use `npx output workflow debug` to understand state
3. **Document why**: Note why you stopped the workflow for future reference
4. **Plan for cleanup**: Know what side effects may need manual handling
5. **Consider alternatives**: Sometimes waiting is better than stopping

## Related Commands

- `npx output workflow status <id>` - Check current status
- `npx output workflow debug <id>` - Review execution details
- `npx output workflow start <name>` - Start a new execution
- `npx output workflow runs list` - View execution history
