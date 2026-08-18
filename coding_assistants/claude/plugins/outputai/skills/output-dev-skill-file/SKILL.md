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
- Listing skill paths in prompt frontmatter
- Debugging skill resolution or `load_skill` tool issues
- Organizing shared expertise across multiple prompts

## Location Convention

Skill files live in a `skills/` folder next to the prompt file. List that folder (or individual files) in the prompt frontmatter. A sibling `skills/` directory is not loaded unless the prompt names it:

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

List skill paths in the prompt YAML frontmatter. Paths resolve relative to the prompt file and can be individual `.md` files or directories of `.md` files. (Model lines below are current as of 2026-05-04 - refresh via [`output-dev-model-selection`](../output-dev-model-selection/SKILL.md).)

```yaml
---
provider: anthropic
model: claude-sonnet-4-6
maxTokens: 2048
skills:
  - ./skills
  - ../shared_skills/tone_guide.md
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

At runtime, Output loads the listed paths and:
1. Adds a summary of available skills to the system message
2. Injects a `load_skill` tool the LLM can call

Do not pass `skills` to `generateText`, `streamText`, `generateTextWithStreaming`, or `Agent`. That argument is rejected. Do not use `skill()` - it is not exported.

Omit `skills` (or set `skills: []`) when a prompt should load none. A sibling `skills/` folder used by other prompts in the same directory is not inherited.

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
# current as of 2026-05-04 - run output-dev-model-selection for the latest
model: claude-sonnet-4-6
maxTokens: 2048
skills:
  - ./skills
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
import { Agent, aiSdk } from '@outputai/llm';

export const reviewContent = step( {
  name: 'reviewContent',
  description: 'Review content using skills for specialized expertise',
  inputSchema: z.object( {
    content: z.string(),
    content_type: z.string(),
    focus: z.string()
  } ),
  outputSchema: z.object( {
    summary: z.string(),
    issues: z.array( z.string() ),
    suggestions: z.array( z.string() ),
    score: z.number()
  } ),
  fn: async input => {
    const agent = new Agent( {
      prompt: 'writing_assistant@v1',
      variables: input,
      output: aiSdk.Output.object( {
        schema: z.object( {
          summary: z.string().describe( '2-3 sentence overview' ),
          issues: z.array( z.string() ).describe( 'Specific problems found' ),
          suggestions: z.array( z.string() ).describe( 'Actionable improvements' ),
          score: z.number().describe( 'Quality score 0-100' )
        } )
      } ),
      maxSteps: 5
    } );
    const { output } = await agent.generate();
    return output;
  }
} );
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

- [ ] Prompt frontmatter lists skill paths (`skills: ./skills` or explicit files)
- [ ] Each skill has a clear, descriptive `description` in frontmatter
- [ ] Skill body contains actionable instructions
- [ ] Prompt file mentions `load_skill` in the system message
- [ ] Listed paths resolve relative to the prompt file
- [ ] Prompts that should load no skills omit `skills` (or set `skills: []`)
- [ ] Skills are focused (one area of expertise per file)
- [ ] Step code passes `maxSteps` (default 10) to allow tool loop iterations

## Related Skills

- `output-dev-prompt-file` - Creating .prompt files that use skills
- `output-dev-agent-class` - Using the Agent class with skills
- `output-dev-step-function` - Using skills in step functions
- `output-dev-folder-structure` - Understanding skill file locations
