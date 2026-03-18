---
name: output-workflow-runs-list
description: List Output SDK workflow execution history. Use when finding failed runs, reviewing past executions, identifying workflow IDs for debugging, filtering runs by workflow type, or investigating recent workflow activity.
allowed-tools: [Bash]
---

# List Workflow Execution History

## Overview

This skill helps you view the execution history of workflows. Use it to find failed runs, identify workflow IDs for debugging, and review past executions.

## When to Use This Skill

- Finding recent failed workflow runs
- Getting a workflow ID for debugging
- Reviewing execution history for a specific workflow
- Investigating when a problem started occurring
- Checking the status of recent executions

## Instructions

### List All Recent Runs

```bash
npx output workflow runs list
```

By default, this shows the 100 most recent workflow executions across all workflow types.

### Available Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--limit <n>` | Number of runs to display | 100 |
| `--format <type>` | Output format: table, json, text | table |

### Filter by Workflow Name

```bash
npx output workflow runs list <workflowName>
```

This shows only runs for the specified workflow type.

### Get Detailed JSON Output

```bash
npx output workflow runs list --format json
```

Use JSON format for programmatic analysis or when you need full details.

## Understanding the Output

### Status Values

| Status | Meaning | Action |
|--------|---------|--------|
| RUNNING | Workflow is currently executing | Wait or monitor |
| COMPLETED | Workflow finished successfully | No action needed |
| FAILED | Workflow encountered an error | Debug with trace |
| TERMINATED | Workflow was manually stopped | Review if expected |
| TIMED_OUT | Workflow exceeded time limit | Check for long operations |

### Key Fields

When viewing runs, pay attention to:

- **Workflow ID**: Unique identifier needed for debugging commands
- **Status**: Current execution state
- **Start Time**: When the execution began
- **End Time**: When the execution completed (if finished)
- **Workflow Name**: The type of workflow that ran

## Examples

**Scenario**: Find failed workflow runs

```bash
# List recent runs and look for FAILED status
npx output workflow runs list --limit 20

# Or use JSON format with jq to filter
npx output workflow runs list --format json | jq '.[] | select(.status == "FAILED")'
```

**Scenario**: Get workflow ID for debugging

```bash
# List runs for a specific workflow
npx output workflow runs list my-workflow --limit 5

# Note the workflow ID from the output (e.g., "abc123xyz")
# Then debug it
npx output workflow debug abc123xyz --format json
```

**Scenario**: Review recent activity for a specific workflow

```bash
# See the last 10 runs of the data-pipeline workflow
npx output workflow runs list data-pipeline --limit 10
```

**Scenario**: Export run history for analysis

```bash
# Get all recent runs as JSON for external analysis
npx output workflow runs list --format json > workflow-runs.json
```

**Scenario**: Find when failures started

```bash
# Look at more history to find patterns
npx output workflow runs list --limit 50 --format json | jq 'group_by(.status) | map({status: .[0].status, count: length})'
```

## Identifying Problems

### Signs of Issues

1. **Multiple FAILED runs**: Indicates a persistent bug
2. **Mix of COMPLETED and FAILED**: Could be input-dependent issues
3. **All recent runs TERMINATED**: Someone may be stopping workflows
4. **Long RUNNING times**: Possible hang or performance issue

### Next Steps After Finding a Failed Run

1. Copy the workflow ID from the run
2. Get the execution trace: `npx output workflow debug <workflowId> --format json`
3. Analyze the trace to identify the failure
4. Apply the appropriate fix based on the error pattern

## Related Commands

- `npx output workflow debug <id>` - Analyze execution trace
- `npx output workflow status <id>` - Check current status
- `npx output workflow result <id>` - Get execution result
- `npx output workflow list` - List available workflows
