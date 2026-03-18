---
name: flow-convert-prompts-to-files
description: Convert inline prompts and prompt arrays to .prompt files with YAML frontmatter. Use when migrating prompts from Flow SDK format to Output SDK prompt files.
allowed-tools: [Bash, Read, Write, Grep, Edit]
---

# Convert Prompts to .prompt Files

## Overview

This skill guides the conversion of Flow SDK inline prompts, XML prompts, and JavaScript prompt arrays to Output SDK `.prompt` files with YAML frontmatter.

## When to Use This Skill

**During Migration:**
- Converting `prompts.ts` or `prompts.xml` to `.prompt` files
- Extracting inline prompts from activities to separate files
- Setting up prompt versioning

## Flow SDK Prompt Formats

Flow SDK uses several prompt formats that need conversion:

### 1. Inline Prompts in Activities

```typescript
// activities.ts
const prompt = `You are an assistant. Analyze: ${text}`;
const response = await completion( { messages: [ { role: 'user', content: prompt } ] } );
```

### 2. JavaScript Prompt Arrays (prompts.ts)

```typescript
// prompts.ts
export const analyzePrompt = [
  { role: 'system', content: 'You are an expert analyst.' },
  { role: 'user', content: 'Analyze this: {{text}}' }
];
```

### 3. XML Prompts (prompts.xml)

```xml
<prompt name="analyze">
  <system>You are an expert analyst.</system>
  <user>Analyze this: {{text}}</user>
</prompt>
```

## Output SDK .prompt File Format

### Basic Structure

```yaml
---
provider: openai
model: gpt-4o
temperature: 0.7
---

<system>
System message here.
</system>

<user>
User message with {{ variable }} interpolation.
</user>
```

### YAML Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | string | Yes | `openai` or `anthropic` |
| `model` | string | Yes | Model identifier |
| `temperature` | number | No | 0-1 sampling temperature |
| `max_tokens` | number | No | Maximum output tokens |

### Common Model Values

**OpenAI:**
- `gpt-4o`
- `gpt-4-turbo`
- `gpt-3.5-turbo`

**Anthropic:**
- `claude-3-5-sonnet-20241022`
- `claude-3-opus-20240229`
- `claude-3-haiku-20240307`

## Conversion Process

### Step 1: Identify All Prompts

Find prompts in the Flow SDK workflow:

```bash
# Check for prompt files
ls src/workflows/my-workflow/prompts.*

# Check for inline prompts in activities
grep -n "role: 'system'" src/workflows/my-workflow/activities.ts
grep -n "role: 'user'" src/workflows/my-workflow/activities.ts
```

### Step 2: Create .prompt File

Name format: `promptName@version.prompt`

```
analyzeDocument@v1.prompt
generateSummary@v1.prompt
extractEntities@v1.prompt
```

### Step 3: Convert Content

#### From Inline Prompt:

```typescript
// Before (activities.ts)
const systemPrompt = 'You are a document analyzer.';
const userPrompt = `Analyze this document: ${documentText}`;
```

```yaml
# After (analyzeDocument@v1.prompt)
---
provider: openai
model: gpt-4o
temperature: 0.3
---

<system>
You are a document analyzer.
</system>

<user>
Analyze this document: {{ documentText }}
</user>
```

#### From JavaScript Array:

```typescript
// Before (prompts.ts)
export const summarizePrompt = [
  { role: 'system', content: 'You summarize text concisely.' },
  { role: 'user', content: 'Summarize: {{text}}\nMax length: {{maxLength}}' }
];
```

```yaml
# After (summarize@v1.prompt)
---
provider: openai
model: gpt-4o
temperature: 0.5
---

<system>
You summarize text concisely.
</system>

<user>
Summarize: {{ text }}
Max length: {{ maxLength }}
</user>
```

#### From XML:

```xml
<!-- Before (prompts.xml) -->
<prompt name="extract">
  <system>You extract key entities from text.</system>
  <user>
    Extract entities from:
    {{#if includeContext}}
    Context: {{context}}
    {{/if}}
    Text: {{text}}
  </user>
</prompt>
```

```yaml
# After (extract@v1.prompt)
---
provider: openai
model: gpt-4o
temperature: 0.2
---

<system>
You extract key entities from text.
</system>

<user>
Extract entities from:
{% if includeContext %}
Context: {{ context }}
{% endif %}
Text: {{ text }}
</user>
```

### Step 4: Update Step to Use Prompt File

```typescript
// Before (activities.ts)
import { summarizePrompt } from './prompts';

export async function summarize( text: string ): Promise<string> {
  const response = await completion( {
    model: 'gpt-4',
    messages: summarizePrompt.map( m => ( {
      ...m,
      content: m.content.replace( '{{text}}', text )
    } ) )
  } );
  return response.content;
}

// After (steps.ts)
import { step, z } from '@outputai/core';
import { generateText } from '@outputai/llm';

export const summarize = step( {
  name: 'summarize',
  inputSchema: z.object( { text: z.string() } ),
  outputSchema: z.string(),
  fn: async ( input ) => {
    const { result } = await generateText( {
      prompt: 'summarize@v1',
      variables: {
        text: input.text
      }
    } );
    return result;
  }
} );
```

## Template Syntax Conversion

**Important**: Convert Handlebars to Liquid.js syntax!

| Handlebars | Liquid.js |
|------------|-----------|
| `{{variable}}` | `{{ variable }}` |
| `{{#if cond}}` | `{% if cond %}` |
| `{{/if}}` | `{% endif %}` |
| `{{#each items}}` | `{% for item in items %}` |
| `{{/each}}` | `{% endfor %}` |
| `{{else}}` | `{% else %}` |

See `flow-convert-handlebars-to-liquid` for detailed conversion rules.

## Complete Migration Example

### Before: prompts.ts (Flow SDK)

```typescript
export const analyzeDocumentPrompt = [
  {
    role: 'system',
    content: `You are a document analysis expert. Analyze documents for:
- Key themes
- Important entities
- Sentiment
- Action items`
  },
  {
    role: 'user',
    content: `Document Type: {{documentType}}

{{#if previousAnalysis}}
Previous Analysis:
{{previousAnalysis}}
{{/if}}

Document Content:
{{content}}

Provide a comprehensive analysis.`
  }
];
```

### After: analyzeDocument@v1.prompt (Output SDK)

```yaml
---
provider: openai
model: gpt-4o
temperature: 0.3
max_tokens: 4000
---

<system>
You are a document analysis expert. Analyze documents for:
- Key themes
- Important entities
- Sentiment
- Action items
</system>

<user>
Document Type: {{ documentType }}

{% if previousAnalysis %}
Previous Analysis:
{{ previousAnalysis }}
{% endif %}

Document Content:
{{ content }}

Provide a comprehensive analysis.
</user>
```

### After: steps.ts (Using the Prompt)

```typescript
import { step, z } from '@outputai/core';
import { generateText, Output } from '@outputai/llm';
import { AnalysisResultSchema, AnalysisResult } from './types.js';

const AnalyzeDocumentInputSchema = z.object( {
  documentType: z.string(),
  content: z.string(),
  previousAnalysis: z.string().optional()
} );

export const analyzeDocument = step( {
  name: 'analyzeDocument',
  inputSchema: AnalyzeDocumentInputSchema,
  outputSchema: AnalysisResultSchema,
  fn: async ( input ) => {
    const { output } = await generateText( {
      prompt: 'analyzeDocument@v1',
      variables: {
        documentType: input.documentType,
        content: input.content,
        previousAnalysis: input.previousAnalysis || ''
      },
      output: Output.object( {
        schema: AnalysisResultSchema
      } )
    } );

    return output;
  }
} );
```

## Prompt Naming Convention

```
{descriptiveName}@{version}.prompt

Examples:
- analyzeDocument@v1.prompt
- generateSummary@v1.prompt
- extractEntities@v2.prompt
- translateContent@v1.prompt
```

## Verification Checklist

- [ ] All prompts extracted to `.prompt` files
- [ ] YAML frontmatter includes provider and model
- [ ] Template syntax converted to Liquid.js
- [ ] Variable spacing correct: `{{ var }}` not `{{var}}`
- [ ] Steps use `generateText()` with prompt reference (use `Output.object()` for structured output)
- [ ] Prompt file names follow naming convention

## Related Skills

- `flow-convert-handlebars-to-liquid` - Template syntax conversion
- `flow-convert-activities-to-steps` - Step conversion
- `flow-analyze-prompts` - Prompt cataloging
