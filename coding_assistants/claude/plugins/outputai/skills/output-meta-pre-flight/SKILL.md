---
name: output-meta-pre-flight
description: Pre-flight validation checks for Output SDK workflow operations. Ensures conventions are followed, requirements are gathered, and quality gates are passed before workflow execution.
allowed-tools: [Read]
---

# Pre-Flight Rules for Output SDK Workflows

## Execution Requirements

- **CRITICAL**: For any step that specifies a subagent in the `subagent=""` XML attribute, you MUST use the specified subagent to perform the instructions for that step
- Process all XML blocks sequentially and completely
- Execute every numbered step in the process_flow EXACTLY as specified

## Output SDK Knowledge Check
Ensure you have a deep understanding of the Output SDK and its capabilities. If not, use Claude Skill: `output-meta-project-context` and read it carefully.

## Output SDK Conventions Check

Before proceeding with any workflow operation, verify:

- **ES Modules**: All imports MUST use `.js` extension for ESM modules
- **HTTP Client**: NEVER use axios directly - always use @output.ai/http wrapper
- **LLM Client**: NEVER use a direct llm call - always use @output.ai/llm wrapper
- **Worker Restarts**: Remember to restart worker after creating workflows: `overmind restart worker`
- **Documentation**: Run `yarn g:workflow-doc` after modifications

## Requirements Gathering Strategy

### Smart Defaults Application
When information is not explicitly provided, apply these defaults:
- **Retry Policies**: 3 attempts with exponential backoff (1s initial, 10s max)
- **OpenAI Models**: Use `gpt-5` unless specified otherwise
- **Error Handling**: ApplicationFailure patterns with appropriate error types
- **Performance**: Optimize for clarity and maintainability over raw speed
- **Timeouts**: 30 seconds for activities, 5 minutes for workflows

### Critical Information Requirements
Only stop to ask for clarification on:
- Ambiguous input/output structures that cannot be inferred from context
- Specific API keys or services not commonly used in the project
- Non-standard error handling or recovery requirements
- Complex orchestration patterns requiring specific sequencing
- External dependencies not already in the project

## Template Processing Rules

- Use exact templates as provided in each step
- Replace all template variables with actual values:
  - `` - The workflow being planned
  - `` - Root project directory path
  - `` - User-provided requirements
  - `` - Current date in YYYY-MM-DD format
  - `` - Current Output SDK version

## Quality Gates

Before proceeding past pre-flight:
1. Confirm all required context is available
2. Verify understanding of the workflow's purpose
3. Check for existing similar workflows to use as patterns
4. Ensure Output SDK conventions are understood
5. Validate that necessary subagents are available

## Plan Creation Rules

- All complex tasks should be tracked in a workflow plan file
- These files should be created at .outputai/plans directory.
- If `.outputai/plans` directory does not exist, create it.
- Ensure the plan folder is named with the date, then the workflow name, then the task name. e.g. 2025_12_16_simple_sum_workflow_creation_plan/PLAN.md
- Track the implementation progress of any plan in a TASK file in the plan folder. e.g. 2025_12_16_simple_sum_workflow_creation_plan/TASK.md
- Use markdown todo list to track the progress of the plan. e.g
