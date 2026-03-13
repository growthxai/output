---
name: flow-convert-handlebars-to-liquid
description: Convert Handlebars template syntax to Liquid.js in prompts. Use when migrating prompt templates from Flow SDK to Output SDK.
allowed-tools: [Bash, Read, Write, Grep, Edit]
---

# Convert Handlebars to Liquid.js Templates

## Overview

This skill guides the conversion of Handlebars template syntax (used in Flow SDK) to Liquid.js syntax (required by Output SDK). This is critical for prompt template migration.

## When to Use This Skill

**During Migration:**
- Converting prompt templates from Flow SDK
- Fixing template syntax errors in migrated prompts
- Setting up new prompt files with correct syntax

**Error Symptoms:**
- Template conditionals not rendering
- Variables not being interpolated
- Syntax errors in prompt files

## Syntax Conversion Reference

### Variable Interpolation

| Handlebars | Liquid.js |
|------------|-----------|
| `{{variable}}` | `{{ variable }}` |
| `{{user.name}}` | `{{ user.name }}` |
| `{{items.[0]}}` | `{{ items[0] }}` |

**Key Rule**: Always include spaces inside braces: `{{ variable }}` not `{{variable}}`

### Conditionals

| Handlebars | Liquid.js |
|------------|-----------|
| `{{#if condition}}` | `{% if condition %}` |
| `{{else}}` | `{% else %}` |
| `{{/if}}` | `{% endif %}` |
| `{{#unless condition}}` | `{% unless condition %}` |
| `{{/unless}}` | `{% endunless %}` |

### Comparison Operators

| Handlebars | Liquid.js |
|------------|-----------|
| `{{#if (eq a b)}}` | `{% if a == b %}` |
| `{{#if (ne a b)}}` | `{% if a != b %}` |
| `{{#if (gt a b)}}` | `{% if a > b %}` |
| `{{#if (lt a b)}}` | `{% if a < b %}` |
| `{{#if (and a b)}}` | `{% if a and b %}` |
| `{{#if (or a b)}}` | `{% if a or b %}` |

### Loops

| Handlebars | Liquid.js |
|------------|-----------|
| `{{#each items}}` | `{% for item in items %}` |
| `{{this}}` | `{{ item }}` |
| `{{@index}}` | `{{ forloop.index0 }}` |
| `{{@first}}` | `{{ forloop.first }}` |
| `{{@last}}` | `{{ forloop.last }}` |
| `{{/each}}` | `{% endfor %}` |

### Default Values

| Handlebars | Liquid.js |
|------------|-----------|
| `{{variable}}` (with default helper) | `{{ variable \| default: "fallback" }}` |

### Comments

| Handlebars | Liquid.js |
|------------|-----------|
| `{{! comment }}` | `{% comment %} comment {% endcomment %}` |
| `{{!-- comment --}}` | `{% comment %} comment {% endcomment %}` |

## Common Conversion Examples

### Example 1: Simple Variable

```handlebars
<!-- Handlebars -->
Hello, {{userName}}! Your order {{orderId}} is ready.
```

```liquid
<!-- Liquid.js -->
Hello, {{ userName }}! Your order {{ orderId }} is ready.
```

### Example 2: Conditional

```handlebars
<!-- Handlebars -->
{{#if includeDetails}}
Here are the details:
{{details}}
{{else}}
No details available.
{{/if}}
```

```liquid
<!-- Liquid.js -->
{% if includeDetails %}
Here are the details:
{{ details }}
{% else %}
No details available.
{% endif %}
```

### Example 3: Nested Conditionals

```handlebars
<!-- Handlebars -->
{{#if isPremium}}
  Premium content:
  {{#if hasAccess}}
    {{premiumContent}}
  {{else}}
    Please upgrade to access.
  {{/if}}
{{else}}
  Basic content: {{basicContent}}
{{/if}}
```

```liquid
<!-- Liquid.js -->
{% if isPremium %}
  Premium content:
  {% if hasAccess %}
    {{ premiumContent }}
  {% else %}
    Please upgrade to access.
  {% endif %}
{% else %}
  Basic content: {{ basicContent }}
{% endif %}
```

### Example 4: Loop

```handlebars
<!-- Handlebars -->
Items to process:
{{#each items}}
- {{this.name}}: {{this.value}}
{{/each}}
```

```liquid
<!-- Liquid.js -->
Items to process:
{% for item in items %}
- {{ item.name }}: {{ item.value }}
{% endfor %}
```

### Example 5: Loop with Index

```handlebars
<!-- Handlebars -->
{{#each steps}}
Step {{@index}}: {{this.description}}
{{/each}}
```

```liquid
<!-- Liquid.js -->
{% for step in steps %}
Step {{ forloop.index }}: {{ step.description }}
{% endfor %}
```

### Example 6: Comparison

```handlebars
<!-- Handlebars -->
{{#if (eq status "active")}}
  Active user
{{else if (eq status "pending")}}
  Pending approval
{{else}}
  Inactive
{{/if}}
```

```liquid
<!-- Liquid.js -->
{% if status == "active" %}
  Active user
{% elsif status == "pending" %}
  Pending approval
{% else %}
  Inactive
{% endif %}
```

### Example 7: Boolean Handling

**Important**: Booleans in Liquid.js templates can be tricky. Convert to strings for reliable comparisons.

```typescript
// In step code, convert boolean to string
variables: {
  hasData: data ? 'yes' : 'no',
  isEnabled: enabled ? 'true' : 'false'
}
```

```liquid
<!-- In prompt -->
{% if hasData == 'yes' %}
Data is available: {{ data }}
{% endif %}

{% if isEnabled == 'true' %}
Feature is enabled.
{% endif %}
```

### Example 8: Default Values

```handlebars
<!-- Handlebars (with helper) -->
Language: {{language}}
```

```liquid
<!-- Liquid.js -->
Language: {{ language | default: "English" }}
```

## Complete Prompt Migration Example

### Before: Handlebars Prompt

```typescript
// prompts.ts
export const analyzePrompt = `
You are an AI assistant.

{{#if systemContext}}
Context: {{systemContext}}
{{/if}}

User Query: {{query}}

{{#if examples}}
Examples:
{{#each examples}}
{{@index}}. Input: {{this.input}}
   Output: {{this.output}}
{{/each}}
{{/if}}

{{#if (eq mode "detailed")}}
Provide a detailed analysis with explanations.
{{else if (eq mode "brief")}}
Provide a brief summary.
{{else}}
Provide a standard response.
{{/if}}
`;
```

### After: Liquid.js Prompt File

```yaml
---
provider: openai
model: gpt-4o
temperature: 0.5
---

<system>
You are an AI assistant.

{% if systemContext %}
Context: {{ systemContext }}
{% endif %}
</system>

<user>
User Query: {{ query }}

{% if examples %}
Examples:
{% for example in examples %}
{{ forloop.index }}. Input: {{ example.input }}
   Output: {{ example.output }}
{% endfor %}
{% endif %}

{% if mode == "detailed" %}
Provide a detailed analysis with explanations.
{% elsif mode == "brief" %}
Provide a brief summary.
{% else %}
Provide a standard response.
{% endif %}
</user>
```

## Finding Handlebars Syntax

Search for patterns that need conversion:

```bash
# Find Handlebars conditionals
grep -r "{{#if" src/workflows/
grep -r "{{/if}}" src/workflows/
grep -r "{{#each" src/workflows/
grep -r "{{#unless" src/workflows/

# Find variables without spaces
grep -r "{{[^#/!]" src/workflows/ | grep -v "{{ "
```

## Verification Checklist

- [ ] All `{{#if ...}}` converted to `{% if ... %}`
- [ ] All `{{/if}}` converted to `{% endif %}`
- [ ] All `{{#each ...}}` converted to `{% for ... in ... %}`
- [ ] All `{{/each}}` converted to `{% endfor %}`
- [ ] All `{{else}}` converted to `{% else %}`
- [ ] All variables have spaces: `{{ var }}` not `{{var}}`
- [ ] Boolean variables converted to strings for comparison
- [ ] Comparison operators use `==`, `!=`, `>`, `<`
- [ ] Loop variables use `forloop.index` instead of `@index`

## Related Skills

- `flow-convert-prompts-to-files` - Full prompt conversion
- `flow-analyze-prompts` - Identifying prompts to convert
- `flow-validation-checklist` - Migration validation
