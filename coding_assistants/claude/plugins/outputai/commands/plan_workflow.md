---
argument-hint: [workflow-description-and-additional-instructions]
description: Workflow Planning Command for Output SDK
version: 0.1.3
model: opus
---

Your task is to generate a comprehensive Output.ai workflow implementation plan in markdown format.

The plan will be displayed to the user who can then decide what to do with it.

Please respond with only the final version of the plan.

Use the todo tool to track your progress through the plan creation process.

# Plan Creation Rules

## Overview

Generate detailed specifications for implementation of a new workflow.

## Output Path

All plan outputs go to: `.outputai/plans/YYYY_MM_DD_<workflow_name>_<task_name>/PLAN.md`

<process_flow>

<step number="0" name="arguments_analysis">

### Step 0: Arguments Analysis

Analyze the arguments provided to the command:

{ $ARGUMENTS }

<substep number="0" name="arguments_analysis">

Ensure they have provided:
  - workflow_description: The description of the workflow to be created
  - additional_instructions: Additional instructions for the workflow

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

<step number="2" name="requirements_clarification">

### Step 2: Requirements Clarification

Clarify scope boundaries and technical considerations by asking numbered questions as needed to ensure clear requirements before proceeding.

<clarification_areas>
  <scope>
    - in_scope: what is included
    - out_of_scope: what is excluded (optional)
  </scope>
  <technical>
    - functionality specifics
    - UI/UX requirements
    - integration points
  </technical>
</clarification_areas>

<decision_tree>
  IF clarification_needed:
    ASK numbered_questions
    WAIT for_user_response
  ELSE:
    PROCEED schema_definition
</decision_tree>

</step>

<step number="3" name="workflow_design" subagent="workflow-planner">

### Step 3: Workflow Design

Design the workflow with clear single purpose steps and sound orchestration logic.

<thought_process>

  1. Define the workflow name and description
  2. What is a valid output schema for the workflow?
  3. What is a valid input schema for the workflow?
  4. What needs to happen to transform the input into the output?
  5. What are the atomic steps that need to happen to transform the input into the output?
  6. How do these steps relate to each other?
  7. Are any of these steps conditional?
  8. Are any of these steps already defined in the project?
  9. How could these steps fail, and how should we handle them? (retry, backoff, etc.)

</thought_process>

<step_output>
Output Draft Plan: to .outputai/plans/YYYY_MM_DD_<workflow_name>_<task_name>/PLAN.md
</step_output>

</step>

<step number="4" name="step_design" subagent="workflow-planner">

### Step 4: Step Design

Design the individual steps called by the workflow with clear boundaries.

<thought_process>
  1. What is the name and description of each step?
  2. What is the input schema for each step?
  3. What is the output schema for each step?
  4. What external services or APIs does each step use?
  5. What error handling is needed for each step?
  6. What retry policies should each step have?
</thought_process>

<step_output>
Output Updated Plan: to .outputai/plans/YYYY_MM_DD_<workflow_name>_<task_name>/PLAN.md
</step_output>

</step>

<step number="4.5" name="evaluator_design" subagent="workflow-planner">

### Step 4.5: Evaluator Design

Determine if the workflow requires quality assessment, validation, or content evaluation.

<decision_tree>
  IF workflow_outputs_need_quality_scoring:
    DESIGN evaluator functions
  IF workflow_has_llm_generated_content:
    CONSIDER content evaluation (factual accuracy, relevance, tone)
  IF workflow_requires_validation_with_confidence:
    DESIGN validation evaluators
  ELSE:
    SKIP evaluator design (note in plan: "No evaluators needed")
</decision_tree>

<thought_process>
  1. Does the workflow produce content that needs quality assessment?
  2. Are there LLM-generated outputs that need evaluation?
  3. Would the workflow benefit from confidence-scored validation?
  4. What evaluation result types are appropriate (boolean/number/string)?
  5. Should evaluators use simple logic or LLM-powered assessment?
  6. Would offline eval testing with `@outputai/evals` be appropriate for dataset-driven verification?
</thought_process>

<step_output>
Output Updated Plan: to .outputai/plans/YYYY_MM_DD_<workflow_name>_<task_name>/PLAN.md
</step_output>

</step>

<step number="5" name="plan_review" subagent="workflow-quality">

### Step 5: Plan Review

Review the draft plan and make any necessary changes.

<thought_process>
  1. Does the plan make sense?
  2. Are all the steps clear and concise?
  3. Are all the dependencies identified?
  4. Does the workflow follow Output SDK conventions?
  5. Are error handling patterns appropriate?
  6. Is the input/output schema design correct?
</thought_process>

<decision_tree>
  IF changes_needed:
    UPDATE draft_plan
  ELSE:
    PROCEED to step 6
</decision_tree>

<step_output>
Output Reviewed Plan: to .outputai/plans/YYYY_MM_DD_<workflow_name>_<task_name>/PLAN.md
</step_output>

</step>

<step number="6" name="prompt_engineering" subagent="workflow-prompt-writer">

### Step 6: Prompt Engineering

If any of the steps use an LLM, design the prompts for the steps.

<decision_tree>
  IF step_uses_llm:
    USE prompt_step_template
  ELSE:
    SKIP to step 7
</decision_tree>

<step_output>
Output Updated Plan: to .outputai/plans/YYYY_MM_DD_<workflow_name>_<task_name>/PLAN.md
</step_output>

</step>

<step number="7" name="testing_strategy" subagent="workflow-debugger">

### Step 7: Testing Strategy

Design the testing strategy for the workflow.

<thought_process>
  1. What unit tests do we need to write?
  2. How can I run the workflow?
  3. What cases do we need to validate?
  4. What scenario files should be created?
  5. Should we create eval datasets for offline testing with `output workflow test`?
  6. What ground truth values are needed for eval datasets?
</thought_process>

<step_output>
Output Updated Plan: to .outputai/plans/YYYY_MM_DD_<workflow_name>_<task_name>/PLAN.md
</step_output>

</step>

<step number="8" name="generate_plan" subagent="workflow-planner">

### Step 8: Generate Plan

Generate the complete plan in markdown format.

Note that every implementation should start with running the cli command `npx output workflow generate --skeleton` to create the workflow directory structure.

<file_template>
  <header>
    # Workflow Requirements Document

    > Workflow: [WORKFLOW_NAME]
    > Created: [CURRENT_DATE]
  </header>
  <required_sections>
    - Overview
    - Spec Scope
    - Out of Scope
    - Workflow Design
    - Step Design
    - Evaluator Design (if applicable)
    - Prompt Design
    - Testing Strategy
    - Implementation Phases
  </required_sections>
</file_template>

<step_output>
Output Final Plan: to .outputai/plans/YYYY_MM_DD_<workflow_name>_<task_name>/PLAN.md
</step_output>

</step>

<step number="9" name="post_flight_check">

### Step 9: Post-Flight Check

Verify the plan is complete and ready for implementation.

<substep number="0" name="post_flight_check">
  EXECUTE: Claude Skill: `output-meta-post-flight`
</substep>

Then instruct the user to:

1. Review the plan
2. Make any necessary changes
3. Implement the workflow with the appropriate build command. e.g. `/outputai:build_workflow <plan_file_path> <workflow_name> <workflow_directory>`

</step>

</process_flow>

---- START ----

Workflow Description and Additional Instructions:

$ARGUMENTS
