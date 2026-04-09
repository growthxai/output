---
argument-hint: "[workflow-plan-file-path] [workflow-name] [workflow-directory]"
description: Workflow Implementation Command for Output SDK
version: 0.1.3
model: opus
---

Your task is to implement an Output.ai workflow based on a provided plan document.

The workflow skeleton has already been created at: `$3` (if not it should be)

Please read the plan file and implement the workflow according to its specifications.

Use the todo tool to track your progress through the implementation process.

# Implementation Rules

## Overview

Implement the workflow described in the plan document, following Output SDK patterns and best practices.

<pre_flight_check>
  EXECUTE: Claude Skill: `output-meta-pre-flight`
</pre_flight_check>

<process_flow>

<step number="1" name="plan_analysis" subagent="workflow-context-fetcher">

### Step 1: Plan Analysis

Read and understand the plan document.

1. Read the plan file from: `$1`
2. Identify the workflow name, description, and purpose
3. Extract input and output schema definitions
4. List all required steps and their relationships
5. Note any LLM-based steps that require prompt templates
6. Understand error handling and retry requirements

</step>

<step number="2" name="workflow_implementation" subagent="workflow-quality">

### Step 2: Workflow Implementation

Update `$3/workflow.ts` with the workflow definition.

<implementation_checklist>
  - Import required dependencies (workflow, z from '@outputai/core')
  - Define inputSchema based on plan specifications
  - Define outputSchema based on plan specifications
  - Import step functions from steps.ts
  - Implement workflow function with proper orchestration
  - Handle conditional logic if specified in plan
  - Add proper error handling
</implementation_checklist>

<workflow_template>
```typescript
import { workflow, z } from '@outputai/core';
import { stepName } from './steps.js';

const inputSchema = z.object( {
  // Define based on plan
} );

const outputSchema = z.object( {
  // Define based on plan
} );

export default workflow( {
  name: '$2',
  description: 'Description from plan',
  inputSchema,
  outputSchema,
  fn: async input => {
    // Implement orchestration logic from plan
    const result = await stepName( input );
    return { result };
  }
} );
```
</workflow_template>

</step>

<step number="3" name="steps_implementation" subagent="workflow-quality">

### Step 3: Steps Implementation

Update `$3/steps.ts` with all step definitions from the plan.

<implementation_checklist>
  - Import required dependencies (step, z from '@outputai/core')
  - Implement each step with proper schema validation
  - Add error handling and retry logic as specified
  - Ensure step names match plan specifications
  - Add descriptive comments for complex logic
</implementation_checklist>

<step_template>
```typescript
import { step, z } from '@outputai/core';

export const stepName = step( {
  name: 'stepName',
  description: 'Description from plan',
  inputSchema: z.object( {
    // Define based on plan
  } ),
  outputSchema: z.object( {
    // Define based on plan
  } ),
  fn: async input => {
    // Implement step logic from plan
    return output;
  }
} );
```
</step_template>

</step>

<step number="3.5" name="evaluators_implementation" subagent="workflow-quality">

### Step 3.5: Evaluators Implementation (if needed)

If the plan includes evaluator functions, implement them in `$3/evaluators.ts`.

<decision_tree>
  IF plan_includes_evaluators:
    CREATE evaluators.ts
    IMPLEMENT evaluator functions per plan
  ELSE:
    SKIP to step 4
</decision_tree>

<implementation_checklist>
  - Import required dependencies (evaluator, z, result types from '@outputai/core')
  - Import generateText and Output from '@outputai/llm' if using LLM-powered evaluators
  - Implement each evaluator with proper schema validation
  - Use appropriate result types (EvaluationBooleanResult, EvaluationNumberResult, EvaluationStringResult)
  - Include confidence scores (0.0-1.0)
  - Add reasoning for transparency
  - All imports use .js extension
  - Consider offline eval tests for dataset-driven verification (see `output-dev-eval-testing` skill)
</implementation_checklist>

<evaluator_template>
```typescript
import { evaluator, z, EvaluationBooleanResult } from '@outputai/core';

export const evaluateName = evaluator( {
  name: 'evaluate_name',
  description: 'Description from plan',
  inputSchema: z.object( {
    // Define based on plan
  } ),
  fn: async input => {
    // Implement evaluation logic from plan
    return new EvaluationBooleanResult( {
      value: true,
      confidence: 0.95,
      reasoning: 'Explanation of evaluation'
    } );
  }
} );
```
</evaluator_template>

</step>

<step number="4" name="prompt_templates" subagent="workflow-prompt-writer">

### Step 4: Prompt Templates (if needed)

If the plan includes LLM-based steps, create prompt templates in `$3/prompts/`.

<decision_tree>
  IF plan_includes_llm_steps:
    CREATE prompt_templates
    UPDATE steps.ts to use loadPrompt and generateText
  ELSE:
    SKIP to step 6
</decision_tree>

<llm_step_template>
```typescript
import { step, z } from '@outputai/core';
import { generateText } from '@outputai/llm';

export const llmStep = step( {
  name: 'llmStep',
  description: 'LLM-based step',
  inputSchema: z.object( {
    param: z.string()
  } ),
  outputSchema: z.string(),
  fn: async ( { param } ) => {
    const { result } = await generateText( {
      prompt: 'prompt_name@v1',
      variables: { param }
    } );
    return result;
  }
} );
```
</llm_step_template>

<prompt_file_template>
```
---
provider: anthropic
model: claude-sonnet-4-6
temperature: 0.7
---

<assistant>
You are a helpful assistant.
</assistant>

<user>

</user>
```
</prompt_file_template>

</step>

<step number="5" name="readme_update">

### Step 5: README Update

Update `$3/README.md` with workflow-specific documentation.

<documentation_requirements>
  - Update workflow name and description
  - Document input schema with examples
  - Document output schema with examples
  - Explain each step's purpose
  - Provide usage examples
  - Document any prerequisites or setup requirements
  - Include testing instructions
</documentation_requirements>

</step>

<step number="6" name="scenario_creation">

### Step 6: Scenario File Creation

Create at least one scenario file in `$3/scenarios/` for testing the workflow.

<scenario_requirements>
  - Create `scenarios/` directory if it doesn't exist
  - Create `test_input.json` with valid example input matching the inputSchema
  - Input values should be realistic and demonstrate the workflow's purpose
  - JSON must be valid and parseable
</scenario_requirements>

<scenario_template>
```json
{
  // Populate with example values matching inputSchema
  // Use realistic test data that demonstrates the workflow
}
```
</scenario_template>

<example>
For a workflow with inputSchema:
```typescript
z.object( {
  topic: z.string(),
  maxLength: z.number().optional()
} )
```

Create `scenarios/test_input.json`:
```json
{
  "topic": "The history of artificial intelligence",
  "maxLength": 500
}
```
</example>

</step>

<step number="7" name="validation" subagent="workflow-quality">

### Step 7: Implementation Validation

Verify the implementation is complete and correct.

<validation_checklist>
  - All steps from plan are implemented
  - Input/output schemas match plan specifications
  - Workflow orchestration logic is correct
  - Error handling is in place
  - LLM prompts are created (if needed)
  - Evaluators are implemented (if specified in plan)
  - Evaluators use correct result types and confidence scores
  - README is updated with accurate information
  - Code follows Output SDK patterns
  - TypeScript types are properly defined
  - Scenario file exists with valid example input
  - Offline eval tests created (if applicable)
</validation_checklist>

</step>

<step number="8" name="post_flight_check">

### Step 8: Post-Flight Check

Verify the implementation is ready for use.

<post_flight_check>
  EXECUTE: Claude Skill: `output-meta-post-flight`
</post_flight_check>

</step>

</process_flow>

<post_flight_check>
  EXECUTE: Claude Skill: `output-meta-post-flight`
</post_flight_check>

---- START ----

Workflow Name: $2

Workflow Directory: $3

Plan File Path: $1

Additional Instructions:

$ARGUMENTS
