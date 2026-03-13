# Output Framework Documentation Guide

This file provides guidance to Claude Code when generating documentation for the Output Framework. In this folder we write docs in MDX for Mintlify (http://mintlify.com/).

---

## 1. Output Framework Overview

Output is an opinionated framework for building AI workflows, extracted from production use at GrowthX.ai. It provides durable execution, prompt management, and LLM integration out of the box.

### Why Output Exists

Building AI workflows at scale surfaces the same problems repeatedly:

- **Prompt management**: Prompts scattered as strings in code or locked in external dashboards. Output uses `.prompt` files - version-controlled, reviewable, deployable with your code.
- **Failure handling**: LLMs timeout, APIs fail, rate limits hit. Output builds on Temporal for automatic retries and durable execution that survives crashes.
- **Non-determinism**: LLM outputs vary. Output provides evaluators - LLM-as-judge patterns with confidence scores to programmatically assess quality.
- **Cost tracking**: Every LLM call traces token counts and model info. Query execution history to see costs by workflow, step, or time period.
- **Provider switching**: Prompts declare their provider in YAML frontmatter. Switch from Anthropic to OpenAI by changing one line.
- **API integrations**: The `httpClient` wrapper adds tracing to every request. See which APIs are slow, which fail, debug with full request/response history.

### Code-First Philosophy

Visual workflow builders (n8n, Zapier, Langflow) work for simple automations but hit walls when you need complex loops, conditional error handling, code review, or CI/CD. Output is code-first because LLMs write code faster than you can drag boxes.

### The Workflow/Step Split

This is the core architectural pattern:

- **Workflows** = Pure orchestration. Control flow, conditionals, loops. No I/O.
- **Steps** = Where I/O happens. API calls, LLM requests, database queries.

Temporal replays workflow code on failures. If you make an API call directly in a workflow, it might run twice. Steps are the transaction boundary - they run once and their results are cached.

---

## 2. Package Architecture

Output is a monorepo with three packages. When generating documentation, read the source code directly - the READMEs provide only basic overview.

| Package | Purpose | Source Location |
|---------|---------|-----------------|
| `@outputai/core` | workflow(), step(), evaluator() primitives | `sdk/core/src/` |
| `@outputai/llm` | generateText, Output.object, Output.array, Output.choice | `sdk/llm/src/` |
| `@outputai/http` | Traced HTTP client wrapper | `sdk/http/src/` |

**Working examples**: `test_workflows/src/` contains tested workflows demonstrating correct SDK patterns.

---

## 3. Target Audience

Output is beginner-friendly but powerful for experienced AI engineers. Documentation serves both. See `persona.md` in the project root for full competitive positioning and messaging.

### The Beginner AI Engineer

Engineers getting into AI development. May come from frontend, backend, ops, or no-code tools. Not yet fluent in prompt engineering, LLM evaluation, or AI infrastructure patterns. Using Claude Code or other AI coding agents to accelerate their learning.

**Goals**: Build AI features without becoming an expert first. Start with Claude Code, learn best practices through the framework's structure.

**Pain points**: Steep learning curve. Every framework assumes expertise. Too many separate tools to evaluate and set up before writing a single line of AI code.

**What Output gives them**: Conventions that teach best practices. Describe what you want, Claude builds it. The codebase they create today is the same one a senior AI engineer would build.

**What good docs feel like**: "I built something real and it works — and I didn't have to become an expert first."

### The Experienced AI Engineer

TypeScript/JavaScript engineers who've been building AI features in production. They know what good AI infrastructure looks like because they've had to build it themselves, piece by piece.

**Goals**: Ship AI features fast with professional-grade infrastructure. Needs reliability, observability, cost control — without SaaS fragmentation.

**Pain points**: No framework is designed for AI coding agents. Prompts locked in dashboards, traces locked in SaaS, evals in a separate tool. Half these tools pivot or get acquired. Tired of stitching.

**What Output gives them**: Everything they'd build anyway — prompts, tracing, evals, cost tracking, durable execution — already done, integrated, and structured for AI agents.

**What good docs feel like**: "This is how I'd build it — but it's already done."

---

## 4. Documentation Style

Model our documentation after [Ruby on Rails Guides](https://guides.rubyonrails.org/). The Rails guides succeed because they balance accessibility with technical depth.

### Structure Principles

**Progressive complexity**: Start with the simplest working example, then layer in features. Each section builds on previous knowledge.

**Problem-first framing**: Open with the problem being solved, then show the solution. Not "here's the API" but "here's what you're trying to do."

**Immediate payoff**: Show working code within the first few paragraphs. Readers should see results before understanding all the theory.

**File paths as context**: Always show where code lives with comments above code blocks:
```javascript
// src/workflows/research/workflow.ts
```

### Page Guidelines

Good pages share these qualities - apply as appropriate, not as a rigid template:

- **Start with context**: Position what you're explaining and why the reader cares
- **Show code early**: Working examples before deep theory
- **Explain as you go**: Weave the "why" into the "how" rather than front-loading concepts
- **Connect to real use**: Relate patterns to actual workflows readers will build
- **Point forward**: Link to related concepts or guides when natural

### Weaving Theory Naturally

Don't create separate callout boxes for fundamentals. Explain concepts when they become relevant in context.

**Good**: "Set `temperature: 0` for extraction tasks - this makes the model deterministic, so the same input produces the same output."

**Bad**:
> **LLM Fundamentals: Temperature**
> Temperature controls randomness in LLM outputs...

When deeper explanation is needed, link to external resources:
"For advanced prompt techniques, see [Anthropic's guide](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering)."

---

## 5. Writing Guidelines

### Voice and Tone

- Write in second person ("you")
- Be direct - state facts confidently, avoid hedging ("might", "perhaps", "seems to")
- Conversational but not casual - explain to a smart colleague, not lecture
- Short paragraphs for emphasis
- Trust the reader's intelligence

### Code Examples

- Show real, working code - never pseudocode
- Use realistic variable names and domains (company research, content generation - not foo/bar)
- Include file paths as comments above code blocks
- Test all examples before publishing

### Formatting

Every MDX page needs frontmatter:
```yaml
---
title: Clear, descriptive title
description: Concise summary for SEO/navigation
---
```

Use language tags on all code blocks. Use relative paths for internal links (`/workflows` not full URLs).

---

## 6. Do Not

- Skip frontmatter on any MDX file
- Use absolute URLs for internal links
- Over-explain or pad content
- Use emojis unless explicitly requested
- Use corporate speak ("leverage", "utilize", "ecosystem")
- Show pseudocode or incomplete examples

---

## 7. Documentation Writing Framework

When creating new documentation or making major revisions to existing files in this folder, you MUST follow this sequential workflow. Do not skip steps or combine them.

### Step 1: Topic Understanding
- Clearly define the topic to be documented
- Identify which Output.ai package(s) are involved
- Determine the scope and boundaries of the documentation

### Step 2: Persona Immersion
- Impersonate both target personas from Section 3:
  - **Beginner AI Engineer**: What would confuse them? What conventions can guide them? Would Claude Code be able to help them through this?
  - **Experienced AI Engineer**: What technical depth do they expect? What patterns do they want to see? What do they already know?
- Write down what each persona needs from this documentation

### Step 3: Source Code Research
- Read the actual source code in `sdk/*/src/` to collect accurate, current information
- Review working examples in `test_workflows/src/`
- Extract real function signatures, types, and behavior
- Never document from memory or assumptions—always verify against code

### Step 4: Outline Review (User Checkpoint)
- Present a structured outline to the user before writing
- Include:
  - Proposed sections and their order
  - Key code examples you plan to include
  - Any gaps or questions discovered during research
- **Wait for user approval before proceeding**

### Step 5: Draft Review (User Checkpoint)
- Write the complete first draft following the outline
- Present the draft to the user for review
- Address feedback and revise as needed
- **Wait for user approval before proceeding**

### Step 6: Polish
- Apply all style guidelines from Section 4 and 5
- Verify all code examples are accurate and tested
- Check frontmatter is complete
- Ensure links work and formatting is correct
- Final review against the "Do Not" list in Section 6

### Framework Enforcement

**CRITICAL**: This CLAUDE.md must remain in your context throughout the entire documentation creation process. Re-read relevant sections before each step if needed.

At each user checkpoint, explicitly state:
- What step you just completed
- What you learned or produced
- What you need approval for before continuing
