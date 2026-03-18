---
argument-hint: [workflow-path] [additional-instructions]
description: Create a migration plan for converting a Flow SDK workflow to Output SDK
version: 0.1.0
model: opus
---

Your task is to migrate a workflow from the Flow SDK to the Output SDK.

# Plan Creation Rules

## Overview

The task is to generate a detailed plan for migrating the given workflow from the Flow SDK to the Output SDK (Flow's successor framework).

<process_flow>

<step number="0" name="arguments_analysis">

### Step 0: Arguments Analysis

Analyze the arguments provided to the command:

{ $ARGUMENTS }

<substep number="0" name="arguments_analysis">

Ensure they have provided:
  - workflow_path: The path to the Flow SDK workflow to migrate
  - additional_instructions: Additional instructions for the migration (optional)

If not, ask the user for the missing information.
</substep>

<substep number="1" name="pre_flight_check">
  EXECUTE: Claude Skill: `output-meta-pre-flight`
</substep>

</step>

<step number="1" name="context_gathering" subagent="workflow-context-fetcher">

### Step 1: Context Gathering

Take the time to gather all the context you need to create a comprehensive plan.
1. Read any given files or links
2. Find any related workflows in the project
3. Read the projects documentation files

</step>

<step number="2" name="workflow_analysis" subagent="flow-workflow-migrator">

### Step 2: Flow Workflow Analysis and Draft Plan

Analyze the workflow and draft a plan for migrating it to the Output SDK.

<thought_process>
  1. What is the workflow name and description?
  2. What is the workflow input and output schema?
  3. What are the workflow steps?
  4. What are the workflow prompts?
  5. What are the workflow errors?
  6. What are the workflow dependencies?
  7. Do any new services / clients need to be created? Do they already exist?
  8. What does an equivalent workflow look like in the Output SDK?
</thought_process>

<step_output>
Output Draft Plan: to .outputai/plans/migrate_flow_workflow_<workflow_name>.md
</step_output>

</step>

<step number="3" name="workflow_design" subagent="workflow-quality">

### Step 3: Workflow Design Review

Review the draft plan and make any necessary changes.

<thought_process>
  1. Does the plan make sense?
  2. Are all the steps clear and concise?
  3. Are all the dependencies identified?
  4. Are all the services / clients identified?
  5. Are all the errors identified?
  6. Are all the tests identified?
  7. Are all the implementation details identified?
  8. Does the new workflows input and output schema match the old workflow?
</thought_process>

<decision_tree>
  IF changes_needed:
    UPDATE draft_plan
  ELSE:
    PROCEED to step 4
</decision_tree>

<step_output>
Output Reviewed Plan: to .outputai/plans/migrate_flow_workflow_<workflow_name>.md
</step_output>

</step>

<step number="4" name="step_review" subagent="workflow-quality">

### Step 4: Step Review

Review the steps and make any necessary changes.

<thought_process>
  1. Do the steps make sense?
  2. Are all the steps clear and concise?
  3. Are all the dependencies identified?
</thought_process>

<decision_tree>
  IF changes_needed:
    UPDATE draft_plan
  ELSE:
    PROCEED to step 5
</decision_tree>

<step_output>
Output Reviewed Plan: to .outputai/plans/migrate_flow_workflow_<workflow_name>.md
</step_output>

</step>

<step number="5" name="prompt_engineering" subagent="workflow-prompt-writer">

### Step 5: Prompt Engineering Review

Review the prompts and make any necessary changes.

<thought_process>
  1. Do the prompts make sense?
  2. Are all the prompts clear and concise?
  3. Are all the dependencies identified?
</thought_process>

<decision_tree>
  IF changes_needed:
    UPDATE draft_plan
  ELSE:
    PROCEED to step 6
</decision_tree>

<step_output>
Output Reviewed Plan: to .outputai/plans/migrate_flow_workflow_<workflow_name>.md
</step_output>

</step>

<step number="6" name="testing_strategy" subagent="workflow-debugger">

### Step 6: Testing Strategy

Design the testing strategy for the workflow.

<thought_process>
  1. What unit tests do we need to write?
  2. How can I run the workflow?
  3. What cases do we need to validate?
</thought_process>

</step>

<step number="7" name="generate_plan" subagent="workflow-planner">

### Step 7: Finalize Plan

Generate the complete plan in markdown format.

Note that every implementation should start with running the cli command `npx output workflow generate --skeleton` to create the workflow directory structure.

<file_template>
  <header>
    # Workflow Migration Plan

    > Workflow: [WORKFLOW_NAME]
    > Created: [CURRENT_DATE]
    > Migration: Flow SDK → Output SDK
  </header>
  <required_sections>
    - Overview
    - Spec Scope
    - Out of Scope
    - Workflow Design
    - Step Design
    - Prompt Design
    - Testing Strategy
    - Implementation Phases
  </required_sections>
</file_template>

<step_output>
Output Final Plan: to .outputai/plans/migrate_flow_workflow_<workflow_name>.md
</step_output>

</step>

<step number="8" name="post_flight_check">

### Step 8: Post-Flight Check

Verify the plan is complete and ready for implementation.

<substep number="0" name="post_flight_check">
  EXECUTE: Claude Skill: `output-meta-post-flight`
</substep>

Then instruct the user to:

1. Review the plan
2. Make any necessary changes
3. Implement the workflow with the appropriate build command: e.g. `/outputai:build_workflow <plan_file_path> <workflow_name> <workflow_directory>`

</step>

</process_flow>

---- START ----

Migrate Flow Workflow:

$ARGUMENTS
