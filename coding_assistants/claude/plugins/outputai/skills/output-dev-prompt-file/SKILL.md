---
name: output-dev-prompt-file
description: Create .prompt files for LLM operations in Output SDK workflows. Use when designing prompts, configuring LLM providers, or using Liquid.js templating.
allowed-tools: [Read, Write, Edit]
---

# Creating .prompt Files

## Overview

This skill documents how to create `.prompt` files for LLM operations in Output SDK workflows. Prompt files use YAML frontmatter for configuration and Liquid.js templating for dynamic content.

## When to Use This Skill

- Creating prompts for LLM-powered workflow steps
- Configuring LLM provider settings (model, temperature, etc.)
- Using template variables in prompts
- Troubleshooting prompt formatting issues

## Location Convention

Prompt files are stored INSIDE the workflow folder:

```
src/workflows/{workflow-name}/
├── workflow.ts
├── steps.ts
├── types.ts
└── prompts/
    ├── analyzeContent@v1.prompt
    ├── generateSummary@v1.prompt
    └── extractData@v2.prompt
```

**Important**: Prompts are workflow-specific and live inside the workflow folder, NOT in a shared location.

## File Naming Convention

```
{promptName}@v{version}.prompt
```

Examples:
- `generateImageIdeas@v1.prompt`
- `analyzeContent@v1.prompt`
- `summarizeText@v2.prompt`

The version suffix (`@v1`, `@v2`) allows for prompt versioning without breaking existing code.

## Basic Structure

```
---
provider: anthropic
model: claude-sonnet-4-6
temperature: 0.7
maxTokens: 4096
---

<system>
System instructions go here.
</system>

<user>
User message with {{ variable }} placeholders.
</user>
```

## YAML Frontmatter Options

### Required Fields

```yaml
---
provider: anthropic    # LLM provider: anthropic, openai, vertex
model: claude-sonnet-4-6  # Model identifier
---
```

### Optional Fields

```yaml
---
provider: anthropic
model: claude-sonnet-4-6
temperature: 0.7       # 0.0 to 1.0, default varies by provider
maxTokens: 4096        # Maximum output tokens
providerOptions:       # Provider-specific options
  thinking:
    type: enabled
    budgetTokens: 2000
---
```

### Common Provider Configurations

#### Anthropic (Claude)

```yaml
---
provider: anthropic
model: claude-sonnet-4-6
temperature: 0.7
maxTokens: 8192
---
```

#### Anthropic with Extended Thinking

```yaml
---
provider: anthropic
model: claude-sonnet-4-6
temperature: 0.7
maxTokens: 32000
providerOptions:
  thinking:
    type: enabled
    budgetTokens: 2000
---
```

#### OpenAI

```yaml
---
provider: openai
model: gpt-5
temperature: 0.7
maxTokens: 4096
---
```

#### Vertex (Gemini)

```yaml
---
provider: vertex
model: gemini-3-pro
temperature: 0.7
maxTokens: 8192
---
```

## Message Blocks

Use XML-style tags to define message roles:

### System Message

```
<system>
You are an expert at analyzing technical content.
Your responses should be clear and structured.
</system>
```

### User Message

```
<user>
Please analyze the following content:

{{ content }}
</user>
```

### Assistant Message (for few-shot examples)

```
<assistant>
I'll analyze this content step by step...
</assistant>
```

## Liquid.js Templating

### Variable Substitution

```
<user>
Analyze this content about {{ topic }}:

{{ content }}

Generate {{ numberOfIdeas }} ideas.
</user>
```

### Conditional Content

```
<system>
You are an expert content analyzer.

{% if colorPalette %}
**Color Palette Constraints:** {{ colorPalette }}
{% endif %}

{% if artDirection %}
**Art Direction Constraints:** {{ artDirection }}
{% endif %}
</system>
```

### Loops

```
<user>
Analyze each of these items:

{% for item in items %}
- {{ item.name }}: {{ item.description }}
{% endfor %}
</user>
```

### Default Values

```
<user>
Generate {{ numberOfIdeas | default: 3 }} ideas for {{ topic }}.
</user>
```

## Complete Example

Based on a real prompt file (`generateImageIdeas@v1.prompt`):

```
---
provider: anthropic
model: claude-sonnet-4-6
temperature: 0.7
maxTokens: 32000
providerOptions:
  thinking:
    type: enabled
    budgetTokens: 2000
---

<system>
You are an expert at creating structured, precise infographic prompts optimized for Gemini's image generation model.

Your task is to generate prompts for informational infographics that illustrate key concepts from the provided content.

CRITICAL RULES you MUST follow:
- Use Markdown dashed lists to specify constraints
- Use ALL CAPS for "MUST" requirements to ensure strict adherence
- Include specific compositional constraints (e.g., rule of thirds, lighting)
- Always include negative constraints to prevent unwanted elements
- Keep each infographic focused on ONE clear concept

{% if colorPalette %}
**Color Palette Constraints:** {{ colorPalette }}
{% endif %}

{% if artDirection %}
**Art Direction Constraints:** {{ artDirection }}
{% endif %}
</system>

<user>
Generate {{ numberOfIdeas }} structured infographic prompts based on key topics from this content.

<content>
{{ content }}
</content>

Each prompt MUST follow this structure:

Create an infographic about [specific topic]. The infographic MUST follow ALL of these constraints:
- The infographic MUST use the reference images as a visual style guide
- The composition MUST follow the rule of thirds for visual balance
- The infographic MUST use clean, minimal design with simple lines and shapes
{% if colorPalette %}- The color palette MUST strictly follow: {{ colorPalette }}{% endif %}
{% if artDirection %}- The art direction MUST strictly follow: {{ artDirection }}{% endif %}
- NEVER include any watermarks, logos, or decorative overlays
- NEVER use generic AI art buzzwords like "hyperrealistic"

Focus on the most important concepts that would benefit from visual explanation.
</user>
```

## CRITICAL: Variable Type Constraint

The `variables` field in `generateText` and `Agent` only accepts **`string | number | boolean`** values. You cannot pass arrays or objects as variables -- TypeScript will reject them.

When your step has complex data (arrays, objects), pre-format it into a string before passing it as a variable:

```typescript
// WRONG - arrays/objects as variables cause TS2322
const { output } = await generateText( {
  prompt: 'rank@v1',
  variables: {
    stories: storyArray,       // Type error: not assignable to string | number | boolean
    interests: interestArray   // Type error: not assignable to string | number | boolean
  }
} );

// CORRECT - pre-format complex data into strings
const storiesText = stories.map( s =>
  `- ${s.title} (score: ${s.score}, by: ${s.author})`
).join( '\n' );
const interestsText = interests.join( ', ' );

const { output } = await generateText( {
  prompt: 'rank@v1',
  variables: {
    stories: storiesText,     // string - OK
    interests: interestsText  // string - OK
  }
} );
```

The prompt template then uses the pre-formatted string directly with `{{ stories }}` instead of Liquid loops. This is simpler and avoids the type constraint entirely.

## Using Prompts in Steps

### With generateText and Output.object()

```typescript
import { generateText, Output } from '@outputai/llm';
import { z } from '@outputai/core';

const { output } = await generateText( {
  prompt: 'generateImageIdeas@v1',  // References prompts/generateImageIdeas@v1.prompt
  variables: {
    content: 'Solar panel technology explained...',
    numberOfIdeas: 3,
    colorPalette: 'blue and green tones',
    artDirection: 'minimalist style'
  },
  output: Output.object( {
    schema: z.object( {
      ideas: z.array( z.string() )
    } )
  } )
} );
// output contains { ideas: [...] }
```

### With generateText

```typescript
import { generateText } from '@outputai/llm';

const { result } = await generateText( {
  prompt: 'summarize@v1',
  variables: {
    content: 'Long article text...',
    maxLength: 200
  }
} );
// result contains the generated text string
```

## Using Skills with Prompts

Prompts can load skill files that provide lazy-loaded instructions to the LLM. Skills keep the initial context small while giving the LLM access to deep expertise on demand. See `output-dev-skill-file` for the full guide on creating skill files.

The simplest approach is colocated auto-discovery. Place `.md` files in a `skills/` folder next to your prompt file:

```
src/workflows/{workflow-name}/
└── prompts/
    ├── writing_assistant@v1.prompt
    └── skills/
        ├── clarity_guidelines.md
        └── structure_guide.md
```

The prompt file does not need any special configuration. Output auto-discovers the `skills/` directory and injects a `load_skill` tool the LLM can call. Mention `load_skill` in the system message so the LLM knows to use it:

```
<system>
You are an expert technical writing assistant.
Use load_skill to get the full instructions for any skill before applying it.
</system>
```

You can also list skill paths explicitly in frontmatter, or create inline skills in code. See `output-dev-skill-file` for all three methods.

## Using Prompts with Agent

Prompts work with both `generateText` and the `Agent` class. Use `Agent` for multi-step tool loops and stateful conversations. See `output-dev-agent-class` for the full guide.

```typescript
import { Agent, Output } from '@outputai/llm';

const agent = new Agent( {
  prompt: 'writing_assistant@v1',
  variables: {
    content_type: 'documentation',
    focus: 'clarity',
    content: input.content
  },
  output: Output.object( { schema: reviewSchema } ),
  maxSteps: 5
} );
const { output } = await agent.generate();
```

## CRITICAL: Prompts and Structured Output Schemas

### Do Not Duplicate the Schema in the Prompt

When a step uses `Output.object()` with `generateText`, the Zod schema is automatically sent to the LLM provider as a tool definition. The LLM already knows the exact JSON shape it must return. **Do not also specify the schema in the prompt.**

This is a best practice documented by multiple LLM providers:

- **Anthropic**: The schema is sent as a tool definition; `.describe()` on fields is how you guide the model's output. The SDK automatically transforms unsupported constraints into field descriptions.
- **Google Vertex AI**: "Only specify the schema in the schema object. Don't also specify the schema in the prompt. Doing both can reduce performance." If you must discuss the schema in the prompt, match the exact field order from the schema.

**Why this matters:**
1. **Performance**: Redundant schema instructions can confuse the model and reduce output quality
2. **Maintenance**: When the schema changes, you must update both the schema AND the prompt, or they drift apart
3. **Correctness**: The prompt's JSON examples can contradict the actual schema (wrong field names, missing fields, wrong types)

### What NOT to Include in Prompts

When `Output.object()` is used, do not include any of these in the prompt:

- `## Output Format` sections describing the JSON shape
- JSON examples showing the expected response structure
- Field-by-field descriptions that mirror the schema
- Instructions like "Return a JSON object with exactly these fields"
- Instructions like "Return only the JSON object with no surrounding explanation"

```
<!-- WRONG - prompt duplicates what Output.object() already sends -->
<system>
## Output Format
Return a JSON object with this shape:
{
  "title": "string",
  "summary": "string",
  "tags": ["string"]
}
</system>
```

### What TO Include in Prompts

Use the prompt for **quality expectations, domain knowledge, and content guidance** -- things the schema cannot express:

```
<!-- CORRECT - prompt focuses on content quality, not structure -->
<system>
Write a concise, specific title (under 80 characters).
The summary should capture the main argument, not just the topic.
Choose tags from the reader's domain -- avoid generic terms like "technology".
</system>
```

### Use `.describe()` on Schema Fields Instead

The right place to communicate field-level expectations is on the schema itself, using `.describe()`. LLM providers use these descriptions when generating output:

```typescript
// In types.ts -- .describe() guides the LLM on each field
const ArticleSummarySchema = z.object( {
  title: z.string().describe( 'Concise title under 80 characters' ),
  summary: z.string().describe( 'One-sentence summary capturing the main argument' ),
  tags: z.array( z.string() ).describe( '3-5 domain-specific tags, avoid generic terms' )
} );
```

The schema handles structure AND field-level guidance; the prompt handles task framing, methodology, and quality standards.

### When the Step Does NOT Use Output.object()

If `generateText` is called **without** `Output.object()` (plain text output), then including output format instructions in the prompt is appropriate since no schema is sent to the provider.

## Best Practices

### 1. Be Explicit About Requirements

```
<system>
CRITICAL RULES you MUST follow:
- Rule 1
- Rule 2
- NEVER do X
- ALWAYS do Y
</system>
```

### 2. Use XML Tags for Structure in User Messages

```
<user>
Analyze the following:

<content>
{{ content }}
</content>

<requirements>
{{ requirements }}
</requirements>
</user>
```

### 3. Provide Examples (Few-Shot)

```
<system>
You analyze sentiment. Return: positive, negative, or neutral.
</system>

<user>
"I love this product!"
</user>

<assistant>
positive
</assistant>

<user>
"{{ text }}"
</user>
```

### 4. Version Your Prompts

When making significant changes, create a new version:
- `analyzeContent@v1.prompt` - Original
- `analyzeContent@v2.prompt` - Improved with better examples

Update the step to use the new version:
```typescript
prompt: 'analyzeContent@v2'  // Changed from v1
```

### 5. Handle Optional Variables

```
{% if optionalField %}
Additional context: {{ optionalField }}
{% endif %}
```

## Common Patterns

### Classification Prompt

```
---
provider: anthropic
model: claude-sonnet-4-6
temperature: 0.3
---

<system>
You are a content classifier. Categorize content into exactly one category.
Available categories: {{ categories | join: ", " }}
</system>

<user>
Classify this content:

{{ content }}
</user>
```

### Extraction Prompt

```
---
provider: anthropic
model: claude-sonnet-4-6
temperature: 0.2
---

<system>
You extract structured data from text. Be precise and only include information explicitly stated.
</system>

<user>
Extract the following fields from this text:
{% for field in fields %}
- {{ field }}
{% endfor %}

Text:
{{ text }}
</user>
```

### Generation Prompt

```
---
provider: anthropic
model: claude-sonnet-4-6
temperature: 0.8
---

<system>
You are a creative writer. Generate engaging content based on the given parameters.
</system>

<user>
Generate {{ count }} {{ type }} about {{ topic }}.

Requirements:
{{ requirements }}
</user>
```

## Verification Checklist

- [ ] File located in `prompts/` folder inside workflow directory
- [ ] File named `{promptName}@v{version}.prompt`
- [ ] YAML frontmatter includes `provider` and `model`
- [ ] Message blocks use proper XML tags (`<system>`, `<user>`, `<assistant>`)
- [ ] Variables use `{{ variableName }}` syntax
- [ ] Conditionals use `{% if %}...{% endif %}` syntax
- [ ] All required variables are documented or have defaults
- [ ] Step code references correct prompt name
- [ ] No JSON output format instructions when step uses `Output.object()` (schema handles structure)

## Related Skills

- `output-dev-skill-file` - Creating skill files for prompts
- `output-dev-agent-class` - Using the Agent class with prompts
- `output-dev-step-function` - Using prompts in step functions
- `output-dev-evaluator-function` - Using prompts in evaluators
- `output-dev-folder-structure` - Understanding prompts folder location
- `output-dev-workflow-function` - Orchestrating LLM-powered steps
