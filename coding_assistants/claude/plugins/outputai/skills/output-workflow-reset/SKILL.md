---
name: output-workflow-reset
description: Re-run an Output SDK workflow from after a specific completed step, creating a new run that replays up to that point and re-executes subsequent steps. Use when iterating on a later step's prompt or logic without re-running the entire workflow, or when recovering from a failure that only affects steps after a known-good point.
allowed-tools: [Bash]
---

# Rerun Workflow From a Step

## Overview

This skill resets a workflow to re-run from after a specific completed step. The current run is terminated and a new run is created that replays the workflow up to the given step (reusing its recorded output), then re-executes every step after it.

Use this to avoid re-running expensive early steps (like LLM calls or slow HTTP requests) when you only need to iterate on a later step.

## When to Use This Skill

- A workflow failed late, but every step before the failure succeeded — rerun from after the last known-good step instead of starting over
- You edited a prompt or step function that only affects steps after step N, and want to validate the change against the same upstream inputs
- You want to branch off an existing run for debugging without re-paying the cost of its earlier LLM/API calls
- Investigating non-determinism in a later step and want to hold earlier outputs constant

## When NOT to Use This Skill

- The workflow is still running — stop it first with `npx output workflow stop <id>` or `terminate <id>`
- The target step never completed — reset requires a completed step to replay up to (returns a `409`)
- You actually want a clean run from scratch — use `npx output workflow run <name>` or `workflow start <name>`
- Earlier steps had side effects you need to re-execute (e.g. writes to an external system) — the replay skips them

## Instructions

### Basic Syntax

```bash
npx output workflow reset <workflowId> --step <stepName>
npx output workflow reset <workflowId> --step <stepName> --reason "<why>"
```

| Flag | Short | Required | Description |
|------|-------|----------|-------------|
| `--step` | `-s` | yes | Name of the completed step to reset after |
| `--reason` | `-r` | no | Free-text reason, recorded in Temporal history for auditability |

The `workflowId` argument is required. The step name is the step function name as it appears in the trace (e.g. `fetchArticle`, `consolidateCompetitors`).

### Finding the Step Name

Step names come from the workflow's execution trace:

```bash
npx output workflow debug <workflowId> --format json
```

Look for step entries with `status: "completed"`. The step name is the one you pass to `--step`.

### What the Command Returns

On success the CLI prints the original `workflowId` and a **new** `runId` — the new run created by the reset. The pre-reset run is terminated.

```
Workflow reset successfully

Workflow ID: lead_enrichment-a1b2c3d4
New Run ID: 8f3e2a91-...
Reset after step: consolidateCompetitors
Reason: retrying with updated prompt
```

Use the new `runId` (via the pinned `workflow runs list`) to inspect the new execution. The `workflowId` is unchanged, so `workflow status` / `workflow result` will target the latest run by default.

## Examples

**Scenario**: Rerun after fixing a downstream prompt

```bash
# The workflow failed at `generateBlogPost`, but `consolidateCompetitors`
# (the step before it) completed successfully.
npx output workflow debug lead_enrichment-a1b2c3d4 --format json
# ... confirms consolidateCompetitors completed

# Edit src/workflows/lead_enrichment/prompts/generate_blog_post@v1.prompt
# Then rerun from after the last good step — skipping the expensive
# competitor consolidation LLM call.
npx output workflow reset lead_enrichment-a1b2c3d4 \
  --step consolidateCompetitors \
  --reason "Retry with updated blog-post prompt"
```

**Scenario**: Iterate on a late step without re-paying upstream costs

```bash
# Workflow completed, but step output is wrong. Rerun just the last step.
npx output workflow reset blog_evaluator-xyz789 --step analyze_claims

# Check the new run's result
npx output workflow result blog_evaluator-xyz789
```

**Scenario**: Record an audit reason

```bash
npx output workflow reset wf-12345 \
  --step fetchCompanyData \
  --reason "Source API returned stale data; rerunning after cache invalidation"
```

**Scenario**: Capture the new run ID for follow-up

```bash
# Grab the new runId from the reset output, then watch it
npx output workflow reset lead_enrichment-a1b2c3d4 --step lookupCompany
npx output workflow status lead_enrichment-a1b2c3d4
npx output workflow result lead_enrichment-a1b2c3d4
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `404` Workflow or step not found | Wrong `workflowId` or `--step` name | Check with `npx output workflow runs list` and `workflow debug <id>` |
| `409` Step has not completed | Target step is still running or never ran | Wait for the step to complete, or pick an earlier completed step |
| API returned invalid response | Transport failure | Check services with `docker ps | grep output` and `curl http://localhost:3001/health` |

## Best Practices

1. **Start from `workflow debug`** — confirm which steps completed before picking a reset point
2. **Reset to the step whose output you want to keep** — reset runs everything *after* `<stepName>`; the step itself is not re-executed
3. **Record a `--reason`** — it shows up in Temporal history and helps teammates (and future you) understand why the run forked
4. **Prefer reset over full rerun for expensive workflows** — if early steps make multi-dollar LLM calls, reset saves real money
5. **Verify side effects first** — if an early step writes to an external system, the replay won't re-write, which is usually what you want but occasionally isn't

## Related Commands

- `npx output workflow debug <id>` — find completed step names to pass to `--step`
- `npx output workflow runs list` — see the new run created by reset alongside the terminated original
- `npx output workflow status <id>` — check the new run's status
- `npx output workflow result <id>` — get the new run's final output
- `npx output workflow stop <id>` / `workflow terminate <id>` — stop a running workflow before resetting
- `npx output workflow run <name>` / `workflow start <name>` — fresh run from scratch (no replay)
