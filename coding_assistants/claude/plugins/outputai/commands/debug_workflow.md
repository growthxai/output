---
argument-hint: [problem-description-and-optional-workflow-id]
description: Debug Output SDK workflow issues
version: 0.1.3
model: opus
---

Your task is to systematically debug an Output SDK workflow issue in a local development environment.

The first argument is a textual description of the problem you're experiencing. If you have a specific workflow ID, include it in your description.

Use the todo tool to track your progress through the debugging process.

# Debugging Process

## Overview

Follow a systematic approach to identify and resolve workflow execution issues: verify infrastructure, gather evidence, analyze traces, and apply targeted fixes.

<pre_flight_check>
  EXECUTE: Claude Skill: `output-meta-pre-flight`
</pre_flight_check>

<process_flow>

<step number="1" name="verify_services">

### Step 1: Verify Services Running

Before debugging, confirm that all required services are operational. The `output-services-check` skill provides comprehensive guidance.

<verification_commands>
```bash
# Check Docker containers are running
docker ps | grep output

# Verify Output services respond
curl -s http://localhost:3001/health || echo "API not responding"

# Check Temporal UI is accessible
curl -s http://localhost:8080 > /dev/null && echo "Temporal UI accessible" || echo "Temporal UI not accessible"
```
</verification_commands>

<decision_tree>
  IF docker_not_running:
    RUN: docker compose up -d
    WAIT: for services to start (30-60 seconds)
  IF output_dev_not_running:
    RUN: npx output dev
    WAIT: for services to initialize
  IF all_services_running:
    PROCEED: to step 2
</decision_tree>

**Expected State**:
- Docker containers for `output` are running
- API server responds at `http://localhost:3001`
- Temporal UI accessible at `http://localhost:8080`

</step>

<step number="2" name="list_workflow_runs">

### Step 2: List Workflow Runs

Identify the failing workflow execution by listing recent runs. The `output-workflow-runs-list` skill provides detailed filtering guidance.

<list_commands>
```bash
# List all recent workflow runs
npx output workflow runs list

# Filter by specific workflow type (if known)
npx output workflow runs list <workflowName>

# Get detailed JSON output for analysis
npx output workflow runs list --format json

# Limit results to most recent
npx output workflow runs list --limit 10
```
</list_commands>

<identification_criteria>
Look for:
- Status: FAILED or TERMINATED
- Recent timestamp matching when the issue occurred
- Workflow type matching the problem description
</identification_criteria>

<decision_tree>
  IF user_provided_workflow_id:
    USE: provided workflow ID
    PROCEED: to step 3
  IF failed_runs_found:
    SELECT: most recent failed run
    NOTE: workflow ID from output
    PROCEED: to step 3
  IF no_runs_found:
    CHECK: workflow exists with `npx output workflow list`
    IF workflow_not_found:
      REPORT: workflow doesn't exist
      SUGGEST: verify workflow name and location
    ELSE:
      SUGGEST: run the workflow with `npx output workflow run <name>`
</decision_tree>

</step>

<step number="3" name="debug_workflow" subagent="workflow-debugger">

### Step 3: Debug Specific Workflow

Retrieve and analyze the execution trace for the identified workflow. The `output-workflow-trace` skill provides analysis techniques.

<debug_commands>
```bash
# Display execution trace (text format)
npx output workflow debug <workflowId>

# Display full untruncated trace (JSON format) - recommended for detailed analysis
npx output workflow debug <workflowId> --format json
```
</debug_commands>

**Tip**: Use `--format json` for complete trace data without truncation.

<analysis_checklist>
1. Identify which step failed
2. Examine the error message and stack trace
3. Check input data passed to the failing step
4. Check output data from preceding steps
5. Look for patterns matching common error types
</analysis_checklist>

<temporal_ui_guidance>
For visual workflow inspection, open the Temporal Web UI at **http://localhost:8080**:
- Find your workflow execution by ID
- View the event history timeline
- Inspect individual step inputs and outputs
</temporal_ui_guidance>

</step>

<step number="4" name="suggest_fixes" subagent="workflow-quality">

### Step 4: Suggest Fixes

Based on the trace analysis, identify the error pattern and suggest targeted fixes. Claude will invoke the relevant error skill based on symptoms.

<error_matching>

| Symptom | Skill |
|---------|-------|
| "incompatible schema" errors, type errors | `output-error-zod-import` |
| Replay failures, inconsistent results | `output-error-nondeterminism` |
| Retries not working, errors swallowed | `output-error-try-catch` |
| Type errors, undefined properties at step boundaries | `output-error-missing-schemas` |
| Workflow hangs, determinism errors | `output-error-direct-io` |
| Untraced requests, axios errors | `output-error-http-client` |

</error_matching>

<decision_tree>
  IF error_matches_known_pattern:
    INVOKE: relevant error skill for detailed fix
  ELSE:
    CONSULT: workflow-quality subagent for additional patterns
    SUGGEST: Manual trace inspection in Temporal UI
</decision_tree>

<verification>
After applying fix:
```bash
# Re-run the workflow to verify
npx output workflow run <workflowName> <input>

# Or start asynchronously and check result
npx output workflow start <workflowName> <input>
npx output workflow status <workflowId>
npx output workflow result <workflowId>
```
</verification>

</step>

</process_flow>

<post_flight_check>
  EXECUTE: Claude Skill: `output-meta-post-flight`
</post_flight_check>

---- START ----

Problem Description and Optional Workflow ID:

$ARGUMENTS
