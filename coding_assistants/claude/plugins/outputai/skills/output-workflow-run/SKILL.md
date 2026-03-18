---
name: output-workflow-run
description: Execute an Output SDK workflow synchronously and wait for the result. Use when running a workflow and needing immediate results, testing workflow execution, or getting the output directly in the terminal.
allowed-tools: [Bash, Read, Write]
---

# Run Workflow Synchronously

## Overview

This skill executes a workflow synchronously, meaning the command waits for the workflow to complete and returns the result directly. This is ideal for testing, quick executions, and when you need immediate feedback.

## When to Use This Skill

- Testing a workflow during development
- Running a workflow and needing the result immediately
- Quick one-off workflow executions
- Debugging by re-running a workflow with different inputs
- When you don't need to monitor the workflow separately

## When to Use Async Instead

Consider using `npx output workflow start` (async) when:
- The workflow takes a long time (minutes to hours)
- You need to run multiple workflows in parallel
- You want to disconnect and check results later
- You need to monitor progress separately

## Instructions

### Basic Syntax

```bash
npx output workflow run <workflowName> --input '<json-input>'
npx output workflow run <workflowName> --input <path-to-json-file>
```

The `--input` flag is required when the workflow expects input data.

### Input Methods

#### 1. Inline JSON

Pass JSON directly on the command line:

```bash
npx output workflow run example --input '{"question": "who really is ada lovelace?"}'
```

#### 2. File Path (Recommended)

Reference a JSON file containing the input:

```bash
npx output workflow run simple --input src/simple/scenarios/question_ada_lovelace.json
```

This is the recommended approach because:
- Input is version controlled and reproducible
- Complex inputs are easier to read and edit
- Scenarios can be shared and reused

### Scenario Folder Pattern (Best Practice)

Workflows typically have a `scenarios/` folder containing test inputs:

```
src/
  my_workflow/
    workflow.ts
    steps.ts
    scenarios/
      basic_test.json
      edge_case_empty.json
      large_payload.json
```

**Best practice workflow:**

1. Create a scenario file with your input:
   ```bash
   # Create scenarios folder if it doesn't exist
   mkdir -p src/my_workflow/scenarios
   ```

2. Write your input to a scenario file:
   ```json
   // src/my_workflow/scenarios/test_user.json
   {
     "userId": "123",
     "options": {
       "verbose": true
     }
   }
   ```

3. Run the workflow referencing the scenario:
   ```bash
   npx output workflow run my_workflow --input src/my_workflow/scenarios/test_user.json
   ```

### Input Examples

```bash
# Inline JSON - simple object
npx output workflow run my-workflow --input '{"userId": "123"}'

# Inline JSON - complex nested input
npx output workflow run data-pipeline --input '{"source": "api", "options": {"limit": 100}}'

# File path - reference a scenario file
npx output workflow run simple --input src/simple/scenarios/basic.json

# File path - relative to current directory
npx output workflow run batch-processor --input ./test_inputs/batch1.json

# No input (only if workflow doesn't require it)
npx output workflow run health-check
```

## Understanding the Output

The command returns the workflow result directly to stdout.

### Success Output
The workflow's return value is displayed, typically as JSON.

### Error Output
If the workflow fails, you'll see:
- Error message
- The workflow ID (for further debugging)
- Suggestion to use `npx output workflow debug` for details

## Examples

**Scenario**: Test a workflow with a scenario file

```bash
# First, look for existing scenarios
ls src/simple/scenarios/

# Run using a scenario file
npx output workflow run simple --input src/simple/scenarios/basic_sum.json

# Output:
# { "sum": 6, "count": 3 }
```

**Scenario**: Create and run a new test scenario

```bash
# Create a scenario file
cat > src/my_workflow/scenarios/test_case_1.json << 'EOF'
{
  "question": "What is the capital of France?",
  "context": "geography"
}
EOF

# Run the workflow
npx output workflow run my_workflow --input src/my_workflow/scenarios/test_case_1.json
```

**Scenario**: Quick inline test during development

```bash
npx output workflow run example --input '{"question": "explain quantum computing"}'
```

**Scenario**: Re-run a workflow with different input for debugging

```bash
# First attempt with scenario file
npx output workflow run process-data --input src/process_data/scenarios/user_abc.json
# Error occurs

# Create a new scenario to isolate the issue
cat > src/process_data/scenarios/debug_minimal.json << 'EOF'
{"id": "test", "debug": true}
EOF

npx output workflow run process-data --input src/process_data/scenarios/debug_minimal.json
```

**Scenario**: Capture output for further processing

```bash
# Save result to a file
npx output workflow run generate-report --input src/generate_report/scenarios/jan_2024.json > report.json

# Pipe to jq for processing
npx output workflow run get-users --input src/get_users/scenarios/active.json | jq '.users[].name'
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Workflow not found" | Workflow name is incorrect | Check with `npx output workflow list` |
| "Invalid input" | JSON doesn't match schema | Verify input matches workflow's inputSchema |
| "Parse error" | Malformed JSON or file not found | Check JSON syntax or file path |
| "Timeout" | Workflow took too long | Use async execution for long workflows |

### Getting More Details on Failures

When a workflow fails, the output includes the workflow ID. Use it to get the full trace:

```bash
npx output workflow run my-workflow --input src/my_workflow/scenarios/test.json
# Output: Workflow failed. ID: abc123xyz

npx output workflow debug abc123xyz --format json
```

## Input Schema Tips

1. **Check the schema first**: Look at the workflow's `inputSchema` in the code
2. **Use scenario files**: Create reusable test inputs in the workflow's `scenarios/` folder
3. **Use proper types**: Strings in quotes, numbers without quotes, booleans as true/false
4. **Include required fields**: All non-optional schema fields must be provided

## Related Commands

- `npx output workflow start <name> --input` - Start asynchronously
- `npx output workflow list` - See available workflows
- `npx output workflow debug <id>` - Debug a failed run
