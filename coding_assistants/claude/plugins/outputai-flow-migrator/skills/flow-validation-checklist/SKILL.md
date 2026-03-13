---
name: flow-validation-checklist
description: Complete migration validation checklist for Flow to Output SDK. Use after migration to verify completeness and correctness.
allowed-tools: [Bash, Read, Grep, Glob]
---

# Migration Validation Checklist

## Overview

This skill provides a comprehensive checklist to validate a completed Flow to Output SDK migration. Use this after migration to ensure nothing was missed.

## When to Use This Skill

**After Migration:**
- Verifying migration completeness
- Before marking migration as done
- During code review of migrated workflow

## Complete Validation Checklist

### 1. Type Safety

- [ ] All step Input/Output interfaces defined in types.ts
- [ ] Workflow input/output schemas defined with Zod
- [ ] Steps use typed input parameters
- [ ] Zod schemas match original type definitions
- [ ] All `z` imports from `@output.ai/core` (not `zod`)

**Validation Commands:**

```bash
# Check for wrong zod imports
grep -r "from 'zod'" src/workflows/my_workflow/
grep -r 'from "zod"' src/workflows/my_workflow/

# Should return nothing - all zod should be from @output.ai/core
```

```bash
# Verify types.ts has Zod schemas
grep -c "z.object" src/workflows/my_workflow/types.ts
```

### 2. Template & Prompt Conversion

- [ ] All prompts extracted to `.prompt` files
- [ ] YAML frontmatter includes provider and model
- [ ] Template conditionals use Liquid.js (`{% if %}` not `{{#if}}`)
- [ ] Variable spacing correct (`{{ var }}` not `{{var}}`)
- [ ] Boolean template variables handled as strings
- [ ] Prompt files follow naming convention (`name@version.prompt`)

**Validation Commands:**

```bash
# Check for remaining Handlebars syntax
grep -r "{{#if" src/workflows/my_workflow/
grep -r "{{/if}}" src/workflows/my_workflow/

# Should return nothing
```

```bash
# Check for variables without spaces
grep -r "{{[^{]" src/workflows/my_workflow/*.prompt 2>/dev/null | grep -v "{{ "

# Should return nothing - all variables should have spaces
```

```bash
# List all prompt files
ls src/workflows/my_workflow/*.prompt

# Verify frontmatter in each
head -10 src/workflows/my_workflow/*.prompt
```

### 3. API & Imports

- [ ] All files import `z` from `@output.ai/core`
- [ ] `step()` and `workflow()` imported from `@output.ai/core`
- [ ] LLM calls use `generateText()` from `@output.ai/llm` (with `Output.object()` for structured output)
- [ ] `ValidationError`/`FatalError` imported from `@output.ai/core`
- [ ] No leftover Flow SDK imports

**Validation Commands:**

```bash
# Check for Flow SDK imports
grep -r "@flow/sdk" src/workflows/my_workflow/
grep -r "WorkflowScope" src/workflows/my_workflow/

# Should return nothing
```

```bash
# Verify correct imports
grep -r "@output.ai/core" src/workflows/my_workflow/
grep -r "@output.ai/llm" src/workflows/my_workflow/
```

### 4. File Structure

- [ ] `workflow.ts` contains workflow definition with `export default`
- [ ] `steps.ts` contains all step definitions
- [ ] `types.ts` contains Input/Output interfaces and Zod schemas
- [ ] Prompt files named `name@version.prompt`
- [ ] No leftover `activities.ts` (renamed to `steps.ts`)
- [ ] No leftover `prompts.ts` or `prompts.xml`
- [ ] File imports have `.js` extension

**Validation Commands:**

```bash
# Check file structure
ls -la src/workflows/my_workflow/

# Expected files:
# - workflow.ts
# - steps.ts
# - types.ts
# - *.prompt files
# - scenarios/ directory (optional)
```

```bash
# Check for leftover files
ls src/workflows/my_workflow/activities.ts 2>/dev/null
ls src/workflows/my_workflow/prompts.ts 2>/dev/null
ls src/workflows/my_workflow/prompts.xml 2>/dev/null

# Should all return "No such file"
```

```bash
# Check import extensions
grep -r "from './" src/workflows/my_workflow/*.ts | grep -v ".js'"

# Should return nothing - all local imports should end with .js
```

### 5. Workflow Definition

- [ ] Workflow uses `workflow()` function (not class)
- [ ] Workflow has `name` property
- [ ] Workflow has `description` property
- [ ] Workflow uses `export default`
- [ ] Workflow name matches legacy name (if required)

**Validation Commands:**

```bash
# Check workflow definition
grep -A10 "export default workflow" src/workflows/my_workflow/workflow.ts
```

```bash
# Verify no class-based workflow
grep "class.*Workflow" src/workflows/my_workflow/workflow.ts

# Should return nothing
```

### 6. Step Definitions

- [ ] All activities converted to steps
- [ ] Steps use `step()` function
- [ ] Steps have `inputSchema` defined
- [ ] Steps use object parameters (not direct parameters)
- [ ] Step names are descriptive

**Validation Commands:**

```bash
# List all steps
grep "export const.*= step" src/workflows/my_workflow/steps.ts
```

```bash
# Verify inputSchema for each step
grep -c "inputSchema:" src/workflows/my_workflow/steps.ts
```

### 7. Error Handling

- [ ] No try-catch blocks wrapping step calls in workflow
- [ ] `ValidationError` used for validation failures
- [ ] `FatalError` used for unrecoverable errors
- [ ] Errors propagate naturally (not re-wrapped)

**Validation Commands:**

```bash
# Check for try-catch in workflow
grep -A20 "fn: async" src/workflows/my_workflow/workflow.ts | grep "try {"

# Should return nothing or minimal results
```

### 8. Business Logic

- [ ] Original workflow logic preserved
- [ ] All activities converted to steps
- [ ] Parameter passing maintains data flow
- [ ] Conditional logic intact
- [ ] Loop logic intact
- [ ] External API calls preserved

**Manual Review:**
- Compare step-by-step execution flow
- Verify data transformations
- Check edge case handling

### 9. ESLint Compliance

- [ ] `npm run lint` passes
- [ ] Single quotes used
- [ ] Spaces in brackets and parentheses
- [ ] No trailing commas
- [ ] Proper line length

**Validation Commands:**

```bash
# Run lint
npm run lint -- src/workflows/my_workflow/

# Should pass with no errors
```

### 10. Runtime Validation

- [ ] Workflow builds successfully
- [ ] Workflow runs with test input
- [ ] Output matches expected format
- [ ] No runtime errors

**Validation Commands:**

```bash
# Build
npm run output:workflow:build

# Run with test input
npx output workflow run my_workflow --input '{"testKey": "testValue"}'
```

## Quick Validation Script

Run this to check common issues:

```bash
#!/bin/bash
WORKFLOW_PATH="src/workflows/my_workflow"

echo "=== Migration Validation ==="

echo -e "\n1. Checking for wrong zod imports..."
grep -r "from 'zod'" $WORKFLOW_PATH && echo "FAIL: Found direct zod imports" || echo "PASS"

echo -e "\n2. Checking for Handlebars syntax..."
grep -r "{{#if" $WORKFLOW_PATH && echo "FAIL: Found Handlebars syntax" || echo "PASS"

echo -e "\n3. Checking for Flow SDK imports..."
grep -r "@flow/sdk" $WORKFLOW_PATH && echo "FAIL: Found Flow SDK imports" || echo "PASS"

echo -e "\n4. Checking for class-based workflow..."
grep "class.*Workflow" $WORKFLOW_PATH/workflow.ts && echo "FAIL: Found class-based workflow" || echo "PASS"

echo -e "\n5. Checking for try-catch in workflow..."
grep -A20 "fn: async" $WORKFLOW_PATH/workflow.ts | grep "try {" && echo "WARN: Found try-catch" || echo "PASS"

echo -e "\n6. Checking import extensions..."
grep "from './" $WORKFLOW_PATH/*.ts | grep -v ".js'" && echo "FAIL: Missing .js extension" || echo "PASS"

echo -e "\n7. Verifying file structure..."
[ -f "$WORKFLOW_PATH/workflow.ts" ] && echo "PASS: workflow.ts exists" || echo "FAIL: workflow.ts missing"
[ -f "$WORKFLOW_PATH/steps.ts" ] && echo "PASS: steps.ts exists" || echo "FAIL: steps.ts missing"
[ -f "$WORKFLOW_PATH/types.ts" ] && echo "PASS: types.ts exists" || echo "FAIL: types.ts missing"

echo -e "\n=== Validation Complete ==="
```

## Related Skills

- `flow-error-zod-import` - Fix zod import issues
- `flow-error-try-catch-removal` - Remove try-catch antipattern
- `flow-error-eslint-compliance` - Fix ESLint issues
- `flow-conventions-folder-structure` - Folder structure reference
