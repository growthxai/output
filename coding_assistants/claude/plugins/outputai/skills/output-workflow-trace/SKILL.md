---
name: output-workflow-trace
description: Analyze Output SDK workflow execution traces. Use when debugging a specific workflow, examining step failures, analyzing input/output data, understanding execution flow, or when you have a workflow ID to investigate.
allowed-tools: [Bash, Read]
---

# Workflow Trace Analysis

## Overview

This skill provides guidance on retrieving and analyzing workflow execution traces using the Output CLI. Traces show the complete execution history including step inputs, outputs, errors, and timing information.

## When to Use This Skill

- You have a workflow ID and need to understand what happened
- A workflow failed and you need to identify which step failed
- You need to examine the input/output data at each step
- You want to understand the execution flow and timing
- You need to find error messages and stack traces
- Debugging retry behavior or unexpected results

## Instructions

### Step 1: Retrieve the Execution Trace

**Basic trace (text format, may be truncated):**
```bash
npx output workflow debug <workflowId>
```

**Full trace (JSON format, recommended for detailed analysis):**
```bash
npx output workflow debug <workflowId> --format json
```

**Tip**: Always use `--format json` when you need complete trace data. The text format truncates long values which can hide important debugging information.

### Step 2: Analyze the Trace

Follow this checklist when examining a trace:

1. **Identify the failed step**: Look for steps with error status or failure indicators
2. **Examine error messages**: Find the exact error message and stack trace
3. **Check step inputs**: Verify the data passed to the failing step was correct
4. **Check step outputs**: Look at outputs from preceding steps
5. **Review retry attempts**: Note how many retries occurred and their outcomes
6. **Check timing**: Look for unusual delays that might indicate timeouts

### Step 3: Use the Temporal UI for Visual Analysis

Open **http://localhost:8080** in your browser for a visual workflow inspection:

1. Search for your workflow by ID
2. View the event history timeline
3. Click on individual events to see details
4. Inspect step inputs and outputs
5. See retry attempts and timing information
6. Export trace data if needed

## What to Look For in Traces

### Error Patterns

| Error Message | Likely Cause |
|---------------|--------------|
| "incompatible schema" | Zod import issue - using `zod` instead of `@output.ai/core` |
| "non-deterministic" | Using Math.random(), Date.now(), etc. in workflow code |
| "FatalError" with retry context | Try-catch wrapping step calls |
| "undefined is not a function" | Missing schema definitions |
| "workflow must be deterministic" | Direct I/O in workflow function |
| "ECONNREFUSED" or timeout | Services not running or network issues |

### Step Status Values

- **COMPLETED**: Step finished successfully
- **FAILED**: Step threw an error (may retry)
- **RETRYING**: Step is being retried after a failure
- **TIMED_OUT**: Step exceeded its timeout
- **CANCELLED**: Workflow was stopped before step completed

### Key Trace Fields

When examining JSON traces, focus on these fields:

- `steps[].name`: Step identifier
- `steps[].status`: Execution result
- `steps[].input`: Data passed to the step
- `steps[].output`: Data returned from the step
- `steps[].error`: Error details if failed
- `steps[].attempts`: Number of execution attempts
- `steps[].duration`: How long the step took

## Examples

**Scenario**: Debug a failed workflow

```bash
# Get the workflow ID from runs list
npx output workflow runs list --limit 5 --format json

# Get detailed trace
npx output workflow debug abc123xyz --format json

# Look for the failing step in the output
# Example output structure:
# {
#   "workflowId": "abc123xyz",
#   "status": "FAILED",
#   "steps": [
#     { "name": "fetchData", "status": "COMPLETED", ... },
#     { "name": "processData", "status": "FAILED", "error": "..." }
#   ]
# }
```

**Scenario**: Investigate retry behavior

```bash
npx output workflow debug abc123xyz --format json | jq '.steps[] | select(.attempts > 1)'
```

**Scenario**: Check inputs to a specific step

```bash
npx output workflow debug abc123xyz --format json | jq '.steps[] | select(.name == "processData") | .input'
```

## Next Steps After Analysis

1. Match the error to common patterns (see error skills)
2. Consult the `workflow-quality` subagent for best practices
3. Make code fixes based on identified issues
4. Re-run the workflow: `npx output workflow run <workflowName> <input>`
5. Verify the fix with a new trace
