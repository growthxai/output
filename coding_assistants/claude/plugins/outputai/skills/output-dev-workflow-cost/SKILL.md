---
name: output-dev-workflow-cost
description: Calculate and display the cost of an Output SDK workflow execution run. Use when checking LLM token costs, API service costs, or total spend for a specific workflow run.
allowed-tools: [Bash]
---

# Workflow Run Cost

## Overview

This skill helps you calculate the cost of a completed workflow execution using the Output CLI. It breaks down costs by LLM model (token usage) and external API service calls.

## When to Use This Skill

- Checking how much a workflow run cost in LLM tokens
- Analyzing API service spend per workflow execution
- Comparing costs between workflow runs
- Presenting cost data during a demo or review

---

## Step 1: Get a Workflow Run ID

The `workflow cost` command requires a **workflow run ID** — not the workflow name.

A run ID looks like: `process_transcripts_2026-03-23-19-35-17-000Z_c2biRk_F9rYktF-wagBf5`

### If you already have a run ID, skip to Step 2.

### If you don't have a run ID:

**Option A — List recent runs** (use skill: `output-workflow-runs-list`):
```bash
npx output workflow runs list <workflowName> --limit 5
```
Copy the run ID from the most recent completed run.

**Option B — Run the workflow now and capture the ID:**

If you know the input, run it synchronously and the run ID will be in the output:
```bash
npx output workflow run <workflowName> --input '{"key": "value"}'
```

Or asynchronously (use skill: `output-workflow-start`):
```bash
npx output workflow start <workflowName> --input '{"key": "value"}'
# Returns: Workflow ID: <runId>
```

If you don't know the input, check for a scenario file (use skill: `output-dev-scenario-file`) or the workflow's `inputSchema` in its `types.ts`.

> **Note:** The workflow **name** (e.g. `process_transcripts`) identifies the workflow type. The workflow **run ID** (e.g. `process_transcripts_2026-03-23T19:35:17.000Z_abc123`) identifies a specific execution. `workflow cost` requires the run ID.

---

## Step 2: Calculate the Cost

### Basic usage (text output):
```bash
npx output workflow cost <runId>
```

### With a local trace file:
```bash
npx output workflow cost <runId> path/to/trace.json
```

### JSON output (for programmatic use or display):
```bash
npx output workflow cost <runId> --format json
```

### Verbose — show per-call breakdown:
```bash
npx output workflow cost <runId> --verbose
```

### All flags:

| Flag | Description | Default |
|------|-------------|---------|
| `--format <type>` | Output format: `text` or `json` | `text` |
| `--verbose` | Show detailed per-LLM-call breakdown | `false` |

---

## Understanding the Output

### Text format example:
```
Workflow: process_transcripts
Duration: 12.3s

LLM Costs:
  claude-sonnet-4 — 1,234 in / 567 out tokens — $0.0123

Services:
  jina — 2 requests — $0.004

Total Cost: $0.0163
```

### JSON format fields:
```json
{
  "workflowName": "process_transcripts",
  "durationMs": 12300,
  "llmTotalCost": 0.0123,
  "totalInputTokens": 1234,
  "totalOutputTokens": 567,
  "services": [{ "serviceName": "jina", "totalCost": 0.004 }],
  "totalCost": 0.0163
}
```

---

## Examples

**Get cost of the last run:**
```bash
# First get the run ID
npx output workflow runs list process_transcripts --limit 1 --format json

# Then get the cost
npx output workflow cost process_transcripts_2026-03-23T19:35:17.000Z_abc123
```

**Get cost as JSON and extract total:**
```bash
npx output workflow cost <runId> --format json | jq '.totalCost'
```

**Show full per-call breakdown:**
```bash
npx output workflow cost <runId> --verbose
```

---

## Related Skills

- `output-workflow-runs-list` — Find run IDs from execution history
- `output-workflow-start` — Start a workflow and capture its run ID
- `output-workflow-run` — Run a workflow synchronously
- `output-dev-scenario-file` — Create or find scenario files for workflow input
