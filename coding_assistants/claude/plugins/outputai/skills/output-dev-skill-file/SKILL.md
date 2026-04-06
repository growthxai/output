---
name: output-dev-skill-file
description: Create .md skill files for Output framework's lazy-loaded instruction system. Use when adding skills to prompts, configuring skill loading, or debugging skill resolution.
allowed-tools: [Read, Write, Edit]
---

# Creating Skill Files

## Overview

This skill documents how to create `.md` skill files for the Output framework's skills system. Skills are lazy-loaded instruction packages that keep prompts lightweight. The LLM sees a list of skill names and descriptions in the system message, then calls a `load_skill` tool to retrieve full instructions on demand.

**Important**: These are framework skills (`.md` files loaded by LLMs at runtime), not Claude Code plugin skills. The naming is similar but the systems are separate.

## When to Use This Skill

- Adding reusable instruction sets to LLM prompts
- Configuring how skills are loaded (auto-discovery, frontmatter, inline)
- Debugging skill resolution or `load_skill` tool issues
- Organizing shared expertise across multiple prompts

## Location Convention

Skill files live in a `skills/` folder next to the prompt file. Output auto-discovers them with no configuration needed:

```
src/workflows/{workflow-name}/
├── workflow.ts
├── steps.ts
├── types.ts
└── prompts/
    ├── writing_assistant@v1.prompt
    └── skills/
        ├── clarity_guidelines.md
        ├── response_format.md
        └── structure_guide.md
```

The `skills/` folder is relative to the prompt file location, not the workflow root.

## Skill File Format

Skill files are markdown documents with an optional YAML frontmatter block:

```markdown
---
name: clarity_guidelines
description: Rules for writing clear, readable technical content
---

# Clarity Guidelines

When reviewing or writing technical content for clarity:

1. **Sentence length**: Keep sentences under 25 words when possible.
   Break complex ideas into multiple sentences.

2. **Active voice**: Prefer active voice ("The function returns X")
   over passive ("X is returned by the function").

3. **Jargon**: Define technical terms on first use.
   Avoid unnecessary acronyms without explanation.

4. **Concrete examples**: Every abstract concept should have
   a concrete example.

When applying this skill, flag any violations you find
and suggest improvements.
```

### Frontmatter Fields

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | No | Filename without `.md` | Identifier the LLM uses with `load_skill` |
| `description` | No | Same as `name` | Shown in system message, helps LLM decide when to load |
| Body | Yes | - | Full instructions returned when LLM calls `load_skill` |

If you omit the frontmatter entirely, the filename (without `.md`) is used as both the name and description. A file named `clarity_guidelines.md` with no frontmatter gets `name: "clarity_guidelines"` and `description: "clarity_guidelines"`.

Write good descriptions. They appear in the system message and are what the LLM uses to decide whether to load a skill. "Rules for writing clear, readable technical content" is better than "clarity_guidelines".

## How Skills Are Loaded

### Method 1: Colocated Auto-Discovery (Default)

Place `.md` files in a `skills/` folder next to your prompt file. Output discovers them automatically. The prompt file needs no special configuration:

```yaml
---
provider: anthropic
model: claude-sonnet-4-6
maxTokens: 2048
---

<system>
You are an expert technical writing assistant.
Use load_skill to get full instructions for any skill before applying it.
</system>

<user>
Review the following {{ content_type }} content focusing on {{ focus }}.

Content:
{{ content }}
</user>
```

At runtime, Output finds the colocated `skills/` directory, loads all `.md` files, and:
1. Adds a summary of available skills to the system message
2. Injects a `load_skill` tool the LLM can call

### Method 2: Frontmatter Paths (Explicit)

Reference specific skill files or directories in the prompt YAML frontmatter. Paths resolve relative to the prompt file:

```yaml
---
provider: anthropic
model: claude-sonnet-4-6
skills:
  - ./skills/
  - ../shared_skills/tone_guide.md
---
```

When `skills:` is set in frontmatter, auto-discovery is skipped. Only the listed paths are loaded.

### Method 3: Inline Skills (Code)

Create skills programmatically with the `skill()` function from `@outputai/llm`:

```typescript
import { skill } from '@outputai/llm';

const audienceSkill = skill({
  name: 'audience_adaptation',
  description: 'Tailor feedback for the specified expertise level',
  instructions: `# Audience Adaptation

When the target audience is specified, adjust your feedback:

**Beginner**: Flag jargon as high-priority issues.
**Expert**: Focus on accuracy and completeness.

Always mention the audience level in your summary.`
});
```

Pass inline skills to `generateText` or `Agent`:

```typescript
const { result } = await generateText({
  prompt: 'writing_assistant@v1',
  variables: { content_type: 'documentation', focus: 'clarity', content: input.content },
  skills: [audienceSkill],
  maxSteps: 5
});
```

Inline skills are merged with any file-based skills.

## Resolution Priority

Skills are resolved in this order:

1. **Frontmatter paths**: If `skills:` is set in the prompt frontmatter, those paths are loaded
2. **Colocated auto-discovery**: If no `skills:` in frontmatter, the `skills/` directory next to the prompt file is scanned
3. **Caller-provided skills**: Skills passed via code (`skills: [...]` in `generateText` or `Agent`) are always merged in

Frontmatter paths and colocated auto-discovery are mutually exclusive. Setting `skills:` in frontmatter disables auto-discovery. Caller-provided skills are always added regardless of which file-based method is used.

## Disabling Skills

Set `skills: []` in the prompt frontmatter to opt out of auto-discovery:

```yaml
---
provider: anthropic
model: claude-haiku-4-5-20251001
skills: []
---
```

This is useful when you have a `skills/` directory for other prompts in the same folder, but a specific prompt should not load any skills.

## Complete Example

### Skill File

```markdown
---
name: response_format
description: Standard format requirements for all review responses
---

# Response Format

Every response MUST end with the exact string "OUTPUT_COMPLETE" on its own line.

Structure your review as follows:

1. **Summary**: 2-3 sentence overview of the content quality
2. **Issues**: Numbered list of specific problems found
3. **Suggestions**: Actionable improvements for each issue
4. **Score**: Overall quality score from 0-100

OUTPUT_COMPLETE
```

### Prompt File Using Skills

```yaml
---
provider: anthropic
model: claude-sonnet-4-6
maxTokens: 2048
---

<system>
You are an expert technical writing assistant.
Use load_skill to get the full instructions for any skill before applying it.
After reviewing, provide structured feedback with specific issues and suggestions.
</system>

<user>
Review the following {{ content_type }} content focusing on {{ focus }}.

Content:
{{ content }}
</user>
```

### Step Using the Prompt

```typescript
import { step, z } from '@outputai/core';
import { Agent, Output } from '@outputai/llm';

export const reviewContent = step({
  name: 'reviewContent',
  description: 'Review content using skills for specialized expertise',
  inputSchema: z.object({
    content: z.string(),
    content_type: z.string(),
    focus: z.string()
  }),
  outputSchema: z.object({
    summary: z.string(),
    issues: z.array(z.string()),
    suggestions: z.array(z.string()),
    score: z.number()
  }),
  fn: async (input) => {
    const agent = new Agent({
      prompt: 'writing_assistant@v1',
      variables: input,
      output: Output.object({
        schema: z.object({
          summary: z.string().describe('2-3 sentence overview'),
          issues: z.array(z.string()).describe('Specific problems found'),
          suggestions: z.array(z.string()).describe('Actionable improvements'),
          score: z.number().describe('Quality score 0-100')
        })
      }),
      maxSteps: 5
    });
    const { output } = await agent.generate();
    return output;
  }
});
```

## Best Practices

### 1. Write Focused Skills

Each skill should cover one area of expertise. Prefer multiple focused skills over one large skill:

```
skills/
├── clarity_guidelines.md      # Writing clarity
├── structure_guide.md         # Document structure
└── response_format.md         # Output formatting
```

### 2. Write Descriptive Descriptions

The description appears in the system message. Make it clear when the LLM should load this skill:

```yaml
---
name: clarity_guidelines
description: Rules for writing clear, readable technical content
---
```

Not:

```yaml
---
name: clarity_guidelines
description: clarity_guidelines
---
```

### 3. Structure Instructions with Headers

Use markdown headers and lists for scannable instructions:

```markdown
# Clarity Guidelines

## Rules
1. Keep sentences under 25 words
2. Prefer active voice
3. Define jargon on first use

## When to Flag
- Sentences over 30 words
- Passive voice in instructions
- Undefined acronyms
```

### 4. Include Actionable Guidance

Tell the LLM what to do with the skill, not just what the skill is about:

```markdown
When applying this skill, flag any violations you find and suggest improvements.
```

## Verification Checklist

- [ ] Skill files are `.md` format in a `skills/` directory next to the prompt file
- [ ] Each skill has a clear, descriptive `description` in frontmatter
- [ ] Skill body contains actionable instructions
- [ ] Prompt file mentions `load_skill` in system message (when using auto-discovery)
- [ ] If using frontmatter paths, all paths resolve correctly
- [ ] If using `skills: []`, auto-discovery is intentionally disabled
- [ ] Skills are focused (one area of expertise per file)
- [ ] Step code passes `maxSteps` (default 10) to allow tool loop iterations

## Related Skills

- `output-dev-prompt-file` - Creating .prompt files that use skills
- `output-dev-agent-class` - Using the Agent class with skills
- `output-dev-step-function` - Using skills in step functions
- `output-dev-folder-structure` - Understanding skill file locations
