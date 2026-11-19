---
name: output-workflow-trace
description: Analyze an Output SDK workflow run from its Temporal history (`workflow debug`). Use when debugging a specific workflow, examining step failures, analyzing input/output data, understanding execution flow, or when you have a workflow ID to investigate.
allowed-tools: [Bash, Read]
---

# Workflow Trace Analysis

## Overview

This skill provides guidance on reading and analyzing a workflow run's Temporal history using the Output CLI. `workflow debug` reads Temporal directly and prints one JSON document with an entry per workflow (the run, then its child workflows), each with its history events, including step inputs, results, failures and timestamps. Long values are truncated.

## When to Use This Skill

- You have a workflow ID and need to understand what happened
- A workflow failed and you need to identify which step failed
- You need to examine the input/output data at each step
- You want to understand the execution flow and timing
- You need to find error messages and stack traces
- Debugging retry behavior or unexpected results

## Instructions

### Step 1: Read the Run's History

```bash
npx output workflow debug <workflowId>
```

The output is one compact JSON document on a single line of stdout, always, so pipe it to `jq` (`jq .` to indent it) instead of reading the raw line. A failure (workflow not found, Temporal unreachable) exits non-zero with the message on stderr and nothing on stdout. Its shape:

```
{ "complete": true, "warnings": [], "temporal": {...},
  "workflows": [
    { "workflowId", "runId", "workflowType", "status", "pendingActivities", "pendingChildren", "events": [ ...raw Temporal events... ] },
    { ...a child workflow: same fields plus "parent": { "workflowId", "runId" } }
  ] }
```

- `complete` is `false` when part of the tree could not be read. Check it first, then read `warnings` (plain sentences naming the workflow and run). A workflow that was not read still has an entry, with `events: []`.
- `workflows[0]` is the run you asked for. Children follow, in the order the parent started them. A workflow that continued as new has one entry per run (same `workflowId` and `parent`, different `runId`; the root's runs have no `parent`), and each run but the last ends with `EVENT_TYPE_WORKFLOW_EXECUTION_CONTINUED_AS_NEW`.
- Events are Temporal's own events with nothing added. Event ids restart in every workflow, so identify an event by its entry plus `eventId`.
- Read a specific run (reset, retry, continue-as-new): `--run-id <runId>`. Without it the latest run is read, and the entry says which run that was. The runs that continue from it are read too, so to see a whole continue-as-new chain pass its first run id.
- Another Temporal: `--profile <name>` (from `temporal.toml`), or `--address` and `--namespace`.
- `--json` is accepted and ignored.
- A workflow id that starts with `-` is read as a flag. Put flags first and `--` before the id: `npx output workflow debug --profile prod -- -Ab...`.

**Tip**: Large values are always truncated (strings over 1,024 characters keep the first 1,000 and last 24, arrays keep 20 items). A marker such as `... [N more characters omitted]` says what was cut. The full payload is in the Temporal UI.

### Step 2: Analyze the History

Follow this checklist:

1. **Check `complete` and `warnings`**, then read each entry's `status` and `pendingActivities` (a stuck run shows its activity, `attempt` and `lastFailure` here)
2. **Find the failure**: filter on `EVENT_TYPE_ACTIVITY_TASK_FAILED`, `EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT` and `EVENT_TYPE_WORKFLOW_EXECUTION_FAILED`
3. **Examine the error**: `failure.message`, `failure.applicationFailureInfo.type`, `failure.stackTrace` (first 10 lines) and `failure.cause`
4. **Find the step**: follow `scheduledEventId` from the failure back to the `EVENT_TYPE_ACTIVITY_TASK_SCHEDULED` event, whose `activityType.name` is `<workflowName>#<stepName>` and whose `input` is what the step received
5. **Check earlier results**: `EVENT_TYPE_ACTIVITY_TASK_COMPLETED` events carry the `result`
6. **Check timing**: compare `eventTime` between the scheduled, started and completed events

A child workflow is its own entry in `workflows`, with a `parent` pointing at the workflow that started it. Events are grouped by workflow, not merged. To see what a parent and its children did at the same moment, build one timeline (each event tagged with `_workflowId`):

```bash
npx output workflow debug <workflowId> | jq '[.workflows[] | .workflowId as $w | .events[] | . + {_workflowId: $w}] | sort_by(.eventTime | sub("Z$"; "") | [ .[0:19], ((.[20:] // "") + "000000000")[0:9] ])'
```

The sort key pads the fractional seconds because Temporal drops trailing zeros, so a plain string sort can misorder events.

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
| "incompatible schema" | Zod import issue - using `zod` instead of `@outputai/core` |
| "non-deterministic" | Using Math.random(), Date.now(), etc. in workflow code |
| "FatalError" with retry context | Try-catch wrapping step calls |
| "undefined is not a function" | Missing schema definitions |
| "workflow must be deterministic" | Direct I/O in workflow function |
| "ECONNREFUSED" or timeout | Services not running or network issues |

### Event Types

- `EVENT_TYPE_ACTIVITY_TASK_SCHEDULED`: a step was scheduled (`activityType.name`, `input`)
- `EVENT_TYPE_ACTIVITY_TASK_COMPLETED`: a step finished (`result`)
- `EVENT_TYPE_ACTIVITY_TASK_FAILED`: a step failed after its retries (`failure`, `retryState`)
- `EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT`: a step exceeded a timeout
- `EVENT_TYPE_WORKFLOW_EXECUTION_FAILED` / `_TIMED_OUT` / `_CANCELED` / `_TERMINATED`: how the run ended
- `EVENT_TYPE_CHILD_WORKFLOW_EXECUTION_STARTED`: a child started (it names the child, whose events are in its own entry)

Activities named `__internal#...` belong to the framework, not your code. Temporal records only the last attempt of an activity: earlier failed retries have no events. On a retried step, `EVENT_TYPE_ACTIVITY_TASK_STARTED` carries `attempt` and `lastFailure` (the failure before it), and `pendingActivities[].attempt` and `lastFailure` on the workflow's entry show the same for a step still retrying.

### Key Fields

Each event holds its data under `<eventName>EventAttributes`, for example `activityTaskFailedEventAttributes`:

- `activityType.name`, `input.payloads[]` (on the scheduled event)
- `result.payloads[]` (on the completed event)
- `failure.message`, `failure.applicationFailureInfo.type`, `failure.stackTrace`, `failure.cause` (on failure events)
- `scheduledEventId`, `startedEventId`: link an event to the events before it
- `eventId`, `eventTime`, `eventType` on every event

Payloads are decoded to plain JSON. A payload that cannot be decoded (for example an encrypted one) prints as `[Undecodable Payload: <encoding>]`.

## Examples

**Scenario**: Debug a failed workflow

```bash
# Get the workflow ID from runs list
npx output workflow runs list --limit 5 --json

# Failures, with their message
npx output workflow debug abc123xyz | jq -c '.workflows[] | .workflowId as $w | .events[] | select(.eventType == "EVENT_TYPE_ACTIVITY_TASK_FAILED") | { workflowId: $w, eventId, scheduledEventId: .activityTaskFailedEventAttributes.scheduledEventId, message: .activityTaskFailedEventAttributes.failure.message }'
```

**Scenario**: List the steps that ran

```bash
npx output workflow debug abc123xyz | jq -r '.workflows[] | .workflowId as $w | .events[] | select(.eventType == "EVENT_TYPE_ACTIVITY_TASK_SCHEDULED") | "\($w) \(.activityTaskScheduledEventAttributes.activityType.name)"'
```

**Scenario**: Check the input to a specific step

```bash
npx output workflow debug abc123xyz | jq '.workflows[].events[] | select(.eventType == "EVENT_TYPE_ACTIVITY_TASK_SCHEDULED" and (.activityTaskScheduledEventAttributes.activityType.name | endswith("#processData"))) | .activityTaskScheduledEventAttributes.input'
```

**Scenario**: See why a run is stuck

```bash
npx output workflow debug abc123xyz | jq -c '.workflows[] | { workflowId, status, pendingActivities, pendingChildren }'
```

**Scenario**: Is the output complete?

```bash
npx output workflow debug abc123xyz | jq '{ complete, warnings }'
```

## Next Steps After Analysis

1. Match the error to common patterns (see error skills)
2. Consult the `workflow-quality` subagent for best practices
3. Make code fixes based on identified issues
4. Re-run the workflow: `npx output workflow run <workflowName> --input '<input>'`
5. Verify the fix by reading the new run with `npx output workflow debug`
