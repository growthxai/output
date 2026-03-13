---
name: flow-create-scenario-files
description: Create scenario files for testing migrated Output SDK workflows. Use to set up test inputs in the scenarios/ subfolder.
allowed-tools: [Bash, Read, Write, Edit]
---

# Create Scenario Files for Workflow Testing

## Overview

This skill helps create scenario files - JSON files containing test inputs for Output SDK workflows. Scenario files enable consistent testing and validation of migrated workflows.

## When to Use This Skill

**After Migration:**
- Setting up test inputs for migrated workflows
- Creating edge case test scenarios
- Documenting expected workflow inputs

**During Development:**
- Adding new test cases
- Debugging workflow behavior

## Scenario File Basics

### Location

Scenario files live in a `scenarios/` subfolder within the workflow directory:

```
src/workflows/my_workflow/
├── workflow.ts
├── steps.ts
├── types.ts
├── analyze@v1.prompt
└── scenarios/
    ├── basic_input.json
    ├── edge_case_empty.json
    └── full_options.json
```

### File Format

Scenario files are JSON files that match the workflow's input schema:

```json
{
  "userId": "user-123",
  "options": {
    "includeDetails": true,
    "maxResults": 10
  }
}
```

### Naming Convention

Use descriptive names that indicate the test case:

```
basic_input.json           # Standard happy path
edge_case_empty.json       # Empty or minimal input
edge_case_large.json       # Large data input
error_missing_field.json   # Missing required field (for error testing)
full_options.json          # All optional fields included
question_ada_lovelace.json # Specific test scenario description
```

## Running Workflows with Scenarios

Use the Output CLI to run a workflow with a scenario file:

```bash
# Basic usage
npx output workflow run <workflow_name> --input src/<workflow>/scenarios/<scenario>.json

# Examples
npx output workflow run simple --input src/simple/scenarios/question_ada_lovelace.json
npx output workflow run userReport --input src/workflows/user_report/scenarios/basic_input.json
```

## Creating Scenario Files

### Step 1: Understand Input Schema

Review the workflow's input schema in `types.ts` or `workflow.ts`:

```typescript
// types.ts
export const WorkflowInputSchema = z.object( {
  userId: z.string(),
  reportType: z.enum( [ 'daily', 'weekly', 'monthly' ] ),
  options: z.object( {
    includeCharts: z.boolean().optional(),
    maxPages: z.number().optional()
  } ).optional()
} );
```

### Step 2: Create scenarios/ Directory

```bash
mkdir -p src/workflows/my_workflow/scenarios
```

### Step 3: Create Basic Scenario

Start with a minimal valid input:

```json
{
  "userId": "test-user-001",
  "reportType": "daily"
}
```

### Step 4: Create Additional Scenarios

**Full Options Scenario:**

```json
{
  "userId": "test-user-001",
  "reportType": "weekly",
  "options": {
    "includeCharts": true,
    "maxPages": 5
  }
}
```

**Edge Case - Empty Optional:**

```json
{
  "userId": "test-user-002",
  "reportType": "monthly",
  "options": {}
}
```

## Deriving Scenarios from Legacy Tests

If the Flow SDK workflow had test files, convert them to scenarios:

### From Flow SDK Test

```typescript
// Original test
describe('UserReportWorkflow', () => {
  it('generates daily report', async () => {
    const input = {
      userId: 'test-123',
      reportType: 'daily'
    };
    const result = await workflow.execute(input);
    expect(result.success).toBe(true);
  });
});
```

### To Output SDK Scenario

```json
// scenarios/daily_report.json
{
  "userId": "test-123",
  "reportType": "daily"
}
```

Run with:
```bash
npx output workflow run userReport --input src/workflows/user_report/scenarios/daily_report.json
```

## Scenario Categories

### 1. Happy Path Scenarios

Test normal, expected usage:

```json
// scenarios/basic_user.json
{
  "userId": "user-12345",
  "action": "process"
}
```

### 2. Edge Case Scenarios

Test boundary conditions:

```json
// scenarios/edge_empty_string.json
{
  "userId": "",
  "action": "validate"
}
```

```json
// scenarios/edge_long_input.json
{
  "userId": "user-12345",
  "content": "Very long content string repeated many times..."
}
```

### 3. Error Scenarios

Test error handling (may cause expected failures):

```json
// scenarios/error_invalid_type.json
{
  "userId": 12345,
  "action": "process"
}
```

### 4. Complex Scenarios

Test complex inputs:

```json
// scenarios/complex_nested.json
{
  "userId": "user-001",
  "documents": [
    {
      "id": "doc-1",
      "title": "First Document",
      "content": "Content of first document"
    },
    {
      "id": "doc-2",
      "title": "Second Document",
      "content": "Content of second document"
    }
  ],
  "options": {
    "processAll": true,
    "outputFormat": "json"
  }
}
```

## Complete Example

### Workflow Input Schema

```typescript
// types.ts
import { z } from '@output.ai/core';

export const AnalyzeDocumentInputSchema = z.object( {
  documentId: z.string(),
  documentText: z.string(),
  analysisType: z.enum( [ 'summary', 'entities', 'sentiment', 'full' ] ),
  options: z.object( {
    language: z.string().optional(),
    maxLength: z.number().optional(),
    includeConfidence: z.boolean().optional()
  } ).optional()
} );
```

### Scenario Files

**scenarios/basic_summary.json:**
```json
{
  "documentId": "doc-001",
  "documentText": "This is a sample document about artificial intelligence and its applications in modern business.",
  "analysisType": "summary"
}
```

**scenarios/full_analysis_with_options.json:**
```json
{
  "documentId": "doc-002",
  "documentText": "Detailed technical document content here...",
  "analysisType": "full",
  "options": {
    "language": "en",
    "maxLength": 500,
    "includeConfidence": true
  }
}
```

**scenarios/edge_minimal.json:**
```json
{
  "documentId": "doc-min",
  "documentText": "Short.",
  "analysisType": "summary"
}
```

**scenarios/edge_empty_options.json:**
```json
{
  "documentId": "doc-003",
  "documentText": "Document with empty options object.",
  "analysisType": "entities",
  "options": {}
}
```

### Running Tests

```bash
# Test basic scenario
npx output workflow run analyzeDocument --input src/workflows/analyze_document/scenarios/basic_summary.json

# Test full options
npx output workflow run analyzeDocument --input src/workflows/analyze_document/scenarios/full_analysis_with_options.json

# Test edge cases
npx output workflow run analyzeDocument --input src/workflows/analyze_document/scenarios/edge_minimal.json
```

## Scenario File Template

Use this template to create new scenarios:

```json
{
  "_scenario": {
    "name": "Descriptive scenario name",
    "description": "What this scenario tests",
    "expectedOutcome": "success|error|specific behavior"
  },
  "field1": "value1",
  "field2": "value2",
  "optionalField": "optional value"
}
```

Note: The `_scenario` metadata field is optional and ignored by the workflow. It's useful for documentation.

## Verification

After creating scenarios, verify they work:

```bash
# List all scenarios
ls src/workflows/my_workflow/scenarios/

# Run each scenario
for f in src/workflows/my_workflow/scenarios/*.json; do
  echo "Testing: $f"
  npx output workflow run my_workflow --input "$f"
done
```

## Related Skills

- `flow-validation-checklist` - Complete migration validation
- `flow-analyze-workflow-structure` - Understanding workflow inputs
- `flow-conventions-folder-structure` - Folder structure conventions
