---
name: flow-analyze-prompts
description: Catalog and analyze prompts in Flow SDK workflows before conversion. Use to identify prompt formats, variables, and conversion requirements.
allowed-tools: [Bash, Read, Grep, Glob]
---

# Analyze Flow SDK Prompts

## Overview

This skill helps catalog and analyze all prompts in a Flow SDK workflow before conversion. Understanding prompt structure, variables, and usage is essential for successful migration.

## When to Use This Skill

**Before Migration:**
- Cataloging prompts in a workflow
- Understanding prompt complexity
- Planning prompt file creation

**During Migration:**
- Verifying all prompts are converted
- Checking variable mappings

## Flow SDK Prompt Formats

### 1. JavaScript Array Format (prompts.ts)

```typescript
export const analyzePrompt = [
  { role: 'system', content: 'You are an analyst.' },
  { role: 'user', content: 'Analyze: {{text}}' }
];
```

### 2. Inline String Format (in activities)

```typescript
const prompt = `You are a helpful assistant.
Analyze this document: ${documentText}`;
```

### 3. XML Format (prompts.xml)

```xml
<prompts>
  <prompt name="analyze">
    <system>You are an analyst.</system>
    <user>Analyze: {{text}}</user>
  </prompt>
</prompts>
```

### 4. Template Literal with Variables

```typescript
const systemPrompt = 'You are an expert.';
const userPrompt = `Query: ${query}
Context: ${context}`;
```

## Analysis Process

### Step 1: Find All Prompt Sources

```bash
# Check for prompt files
ls src/workflows/my_workflow/prompts.*

# Check for inline prompts
grep -n "role:" src/workflows/my_workflow/activities.ts
grep -n "content:" src/workflows/my_workflow/activities.ts
```

### Step 2: Extract Prompts from prompts.ts

```bash
# List all exported prompts
grep -n "export const.*Prompt" src/workflows/my_workflow/prompts.ts

# View full prompt definitions
cat src/workflows/my_workflow/prompts.ts
```

### Step 3: Find Inline Prompts in Activities

```bash
# Find template literals that might be prompts
grep -n "const.*=" src/workflows/my_workflow/activities.ts | grep -E "prompt|Prompt"

# Find string interpolations
grep -n "\${" src/workflows/my_workflow/activities.ts
```

### Step 4: Analyze XML Prompts

```bash
# List prompt names in XML
grep -o 'name="[^"]*"' src/workflows/my_workflow/prompts.xml

# View full XML
cat src/workflows/my_workflow/prompts.xml
```

### Step 5: Extract Variables

For each prompt, identify variables:

```bash
# Find Handlebars variables
grep -o "{{[^}]*}}" src/workflows/my_workflow/prompts.ts

# Find template literal variables
grep -o "\${[^}]*}" src/workflows/my_workflow/activities.ts
```

### Step 6: Map Prompt Usage

Find where each prompt is used:

```bash
# Find prompt imports
grep -n "from.*prompts" src/workflows/my_workflow/activities.ts

# Find prompt variable usage
grep -n "analyzePrompt" src/workflows/my_workflow/activities.ts
```

## Prompt Catalog Template

Create a catalog of all prompts:

```markdown
# Prompt Catalog: [workflow_name]

## Summary

| Metric | Count |
|--------|-------|
| Total Prompts | 5 |
| In prompts.ts | 3 |
| Inline (activities) | 2 |
| XML Prompts | 0 |

## Prompts

### 1. analyzePrompt

**Source**: prompts.ts (line 5)
**Type**: Array format
**Used In**: analyzeDocument activity

**System Message**:
```
You are a document analysis expert.
```

**User Message**:
```
Analyze this document:
{{documentText}}

Focus on: {{focusAreas}}
```

**Variables**:
| Variable | Type | Source |
|----------|------|--------|
| documentText | string | activity parameter |
| focusAreas | string[] | activity parameter |

**Template Syntax Issues**:
- Uses Handlebars `{{}}` - needs Liquid.js conversion
- Variable spacing needs fixing

**Target File**: analyzeDocument@v1.prompt

---

### 2. summarizePrompt

**Source**: prompts.ts (line 25)
**Type**: Array format
**Used In**: summarizeContent activity

...
```

## Variable Analysis

### Handlebars Variables to Convert

| Variable Pattern | Liquid.js Conversion |
|-----------------|---------------------|
| `{{text}}` | `{{ text }}` |
| `{{#if condition}}` | `{% if condition %}` |
| `{{user.name}}` | `{{ user.name }}` |

### Template Literal Variables

```typescript
// These need to be converted to Liquid.js variables
${documentText}  →  {{ documentText }}
${user.name}     →  {{ user.name }}
```

## Prompt Complexity Assessment

### Simple Prompts
- Single system + user message
- Few variables
- No conditionals

### Complex Prompts
- Multiple conditionals
- Loops over data
- Nested structures
- Boolean handling

## Quick Analysis Commands

### Count prompts by type

```bash
# Count exported prompts
grep -c "export const.*Prompt" src/workflows/my_workflow/prompts.ts

# Count role definitions (each prompt has at least one)
grep -c "role:" src/workflows/my_workflow/prompts.ts

# Count Handlebars conditionals
grep -c "{{#if" src/workflows/my_workflow/prompts.ts
```

### List all variables

```bash
# Handlebars variables (unique)
grep -oh "{{[^#/!][^}]*}}" src/workflows/my_workflow/prompts.ts | sort -u

# All Handlebars patterns
grep -oh "{{[^}]*}}" src/workflows/my_workflow/prompts.ts | sort -u
```

### Check for complex patterns

```bash
# Conditionals
grep -c "{{#if" src/workflows/my_workflow/prompts.ts
grep -c "{{#unless" src/workflows/my_workflow/prompts.ts

# Loops
grep -c "{{#each" src/workflows/my_workflow/prompts.ts

# Comparisons
grep -c "{{#if (eq" src/workflows/my_workflow/prompts.ts
```

## Output: Prompt Conversion Plan

After analysis, create conversion plan:

```markdown
# Prompt Conversion Plan

## Files to Create

| Prompt Name | Target File | Variables | Complexity |
|-------------|-------------|-----------|------------|
| analyzePrompt | analyzeDocument@v1.prompt | documentText, focusAreas | Medium |
| summarizePrompt | summarize@v1.prompt | text, maxLength | Low |
| extractPrompt | extract@v1.prompt | content, categories, includeScores | High |

## Variable Mappings

| Original | Prompt Variable | Step Input |
|----------|-----------------|------------|
| documentText | {{ documentText }} | input.documentText |
| focusAreas | {{ focusAreas }} | input.focusAreas.join(', ') |
| includeScores | {{ includeScores }} | input.includeScores ? 'yes' : 'no' |

## Syntax Conversions Required

- [ ] 5 Handlebars conditionals → Liquid.js
- [ ] 2 Handlebars loops → Liquid.js for loops
- [ ] 12 variables need spacing fix

## Notes

- extractPrompt has boolean variables that need string conversion
- analyzePrompt uses nested conditionals
```

## Related Skills

- `flow-convert-prompts-to-files` - Prompt file conversion
- `flow-convert-handlebars-to-liquid` - Template syntax
- `flow-analyze-workflow-structure` - Overall workflow analysis
