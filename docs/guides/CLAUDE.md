# Output Framework Documentation Guide

This file provides guidance to Claude Code when generating documentation for the Output Framework. In this folder we write docs in MDX for Mintlify (http://mintlify.com/).

---

## 1. Output Framework Overview

Output is the open-source TypeScript framework for building AI workflows and agents. Designed for Claude Code — describe what you want, Claude builds it, with all the best practices already in place. Prompts, evals, tracing, cost tracking, orchestration, credentials. One framework. No SaaS fragmentation.

### Build AI Using AI

Output is the first framework designed for AI coding agents. The entire codebase is structured so Claude Code can scaffold, plan, generate, test, and iterate on your workflows. Each workflow is a folder — `workflow.ts`, `steps.ts`, `types.ts`, `prompts/`, `evaluators.ts` — everything the agent needs to understand context lives together.

Beginners ship professional code from day one — the conventions teach best practices. Experienced AI engineers stop rebuilding the same infrastructure.

### Everything Included

No more stitching together SaaS subscriptions. Output handles the fundamentals in one place:

- **Prompt management**: `.prompt` files with LiquidJS templating — version-controlled, reviewable in PRs, deployed with your code. Not scattered strings. Not locked in external dashboards.
- **Multi-provider LLM**: Anthropic, OpenAI, Azure, Vertex AI, Bedrock. Switch providers by changing one line in your prompt file.
- **LLM-as-judge evals**: Built-in evaluators with confidence scores and reasoning. Test non-deterministic code programmatically, not vibes.
- **Tracing and cost tracking**: Every operation traced automatically. Token counts, costs, latency. JSON on disk, zero config. You own your data.
- **Durable orchestration**: Temporal under the hood. Automatic retries, workflow history, replay on failure. You don't think about it until you need it.
- **Encrypted credentials**: AES-256-GCM encrypted secrets, scoped per environment and workflow. No more sharing `.env` files or external vault subscriptions.

### The Workflow/Step Split

Two functions to organize your code: `workflow()` for orchestration, `step()` for I/O.

- **Workflows** = Pure orchestration. Control flow, conditionals, loops. No I/O.
- **Steps** = Where I/O happens. API calls, LLM requests, database queries.

Temporal replays workflow code on failures. If you make an API call directly in a workflow, it might run twice. Steps are the transaction boundary — they run once and their results are cached.

---

## 2. Package Architecture

Output is a monorepo with three packages. When generating documentation, read the source code directly - the READMEs provide only basic overview.

| Package | Purpose | Source Location |
|---------|---------|-----------------|
| `@outputai/core` | workflow(), step(), evaluator() primitives | `sdk/core/src/` |
| `@outputai/llm` | generateText, Output.object, Output.array, Output.choice | `sdk/llm/src/` |
| `@outputai/http` | Traced HTTP client wrapper | `sdk/http/src/` |

**Working examples**: `test_workflows/src/` contains tested workflows demonstrating correct framework patterns.

---

## 3. Target Audience

Output is beginner-friendly but powerful for experienced AI engineers. Documentation serves both. See `persona.md` in the project root for full competitive positioning and messaging.

### The Beginner AI Engineer

Engineers getting into AI development. May come from frontend, backend, ops, or no-code tools. Not yet fluent in prompt engineering, LLM evaluation, or AI infrastructure patterns. Using Claude Code or other AI coding agents to accelerate their learning.

**Goals**: Build AI features without becoming an expert first. Start with Claude Code, learn best practices through the framework's structure.

**Pain points**: Steep learning curve. Every framework assumes expertise. Too many separate tools to evaluate and set up before writing a single line of AI code.

**What Output gives them**: Conventions that teach best practices. Describe what you want, Claude builds it. The codebase they create today is the same one a senior AI engineer would build.

**What good docs feel like**: "I built something real and it works — and I didn't have to become an expert first."

**Common traps** (watch for these and preempt them):
- Putting API calls directly in `workflow()` instead of `step()` — this is the #1 beginner mistake
- Confusing the orchestration layer (workflow) with the execution layer (step)
- Not understanding *why* Temporal exists — they'll resist the workflow/step split until they see what happens without it
- Treating `.prompt` files as just strings — missing that they're version-controlled, templated, and reviewable

### The Experienced AI Engineer

TypeScript/JavaScript engineers who've been building AI features in production. They know what good AI infrastructure looks like because they've had to build it themselves, piece by piece.

**Goals**: Ship AI features fast with professional-grade infrastructure. Needs reliability, observability, cost control — without SaaS fragmentation.

**Pain points**: No framework is designed for AI coding agents. Prompts locked in dashboards, traces locked in SaaS, evals in a separate tool. Half these tools pivot or get acquired. Tired of stitching.

**What Output gives them**: Everything they'd build anyway — prompts, tracing, evals, cost tracking, durable execution — already done, integrated, and structured for AI agents.

**What good docs feel like**: "This is how I'd build it — but it's already done."

**Fast-paths** (what they already know, so get out of the way):
- Retry semantics, error handling patterns, async orchestration — show the Output API and move on
- They'll skim code examples for the shape of the API, not read every line — make examples scannable
- They want to know what's opinionated vs. configurable — flag Output's decisions and where to override them

### The "Badass User" Principle

Documentation doesn't exist to explain Output. It exists to make the reader capable of building things they couldn't build before. Every guide should answer one question: **"What can the reader do after this that they couldn't do before?"**

Frame guide openings around the capability gained, not the topic covered:

**Good**: "After this guide, you can make any external API call reliable — retries, caching, and failure handling — without thinking about infrastructure."

**Bad**: "This guide covers Output's step() function and its configuration options."

The reader doesn't care about Output. They care about what Output lets them build. Write for the outcome, not the tool.

### What Beginner-Friendly Looks Like in Practice

These are the concrete techniques used across our guides:

- **Always show both paths**: The AI-assisted way (Claude Code prompt) AND the manual CLI command. Use the "Under the hood" pattern to bridge them — show the natural language request, then the CLI command underneath.
- **Explain why, not just how**: "Steps are the transaction boundary — they run once and their results are cached" is better than "put I/O in steps."
- **Use parenthetical asides for important constraints**: "(No I/O here — this matters later when we cover rewinding and replaying workflows.)" Flag constraints at the moment the reader encounters them, without derailing the explanation.
- **Scaffold, don't lecture**: Trust the reader's intelligence. Provide enough context to follow along without over-explaining basics they can infer.
- **Real outcomes immediately**: The reader should see a working result within the first few minutes of following a guide, then understand the theory after.
- **Simplified models first, refined later**: Give a mental model that's useful now, even if incomplete. "Workflows are the plan, steps are the work" is enough to start. Correct and deepen the model when the reader encounters the edge case that demands it — not before.

---

## 4. Documentation Style

Model our documentation after [Ruby on Rails Guides](https://guides.rubyonrails.org/). The Rails guides succeed because they balance accessibility with technical depth.

### Structure Principles

**Progressive complexity**: Start with the simplest working example, then layer in features. Each section builds on previous knowledge. Introduce a maximum of 2-3 new concepts per section — then give the reader something to do before introducing more. Working memory is the bottleneck, not the reader's intelligence.

**Problem-first framing**: Open with the problem being solved, then show the solution. Not "here's the API" but "here's what you're trying to do."

**Immediate payoff**: Show working code within the first few paragraphs. Readers should see results before understanding all the theory.

**File paths as context**: Always show where code lives with comments above code blocks:
```javascript
// src/workflows/research/workflow.ts
```

**Exposure before mastery**: Not every concept needs deep understanding on first encounter. Some should be planted as seeds and deepened later: "Temporal handles retries under the hood — you'll configure this in the orchestration guide." This prevents the reader from getting stuck on concepts they don't need yet.

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

### Recurring Patterns

These patterns appear consistently across our guides. Use them:

**Show → Explain → Deepen → Reference**: Show working code first, explain what each part does, go deeper into rules/options, then link forward to related guides.

**"Under the hood"**: When demonstrating Claude Code workflows, show the natural language prompt as a blockquote, then the CLI command that runs beneath it:

```markdown
Tell Claude Code:

> "Run the blog_evaluator workflow with the test scenario"

**Under the hood**, Claude Code runs:

\`\`\`bash
npx output workflow run blog_evaluator paulgraham_hwh
\`\`\`
```

**"In practice this means:"**: Use before translating an abstract rule into a concrete example. Pairs well with Do/Don't `<CardGroup>` layouts.

**"Notice the [pattern]"**: Draw the reader's attention to a structural choice in the code they just saw: "Notice the **API client pattern**: the Jina client lives in `src/clients/jina.ts`, separate from the workflow."

**Constraints taught with reasoning**: Never list a rule without its "because." "Don't make API calls directly in workflows — Temporal replays workflow code on failures, so a direct API call might run twice."

**Metaphors — sparingly**: "Think of it as the conductor — it coordinates, but doesn't do the work itself." One metaphor to anchor a concept, then move on. Don't extend or mix metaphors.

**"Try this"**: After showing a working example, prompt the reader to modify it. One sentence, immediately actionable: "Try adding a second step that validates the LLM output before returning it." This switches the brain from consumption to construction.

**Pattern exposure through variation**: When teaching a structural pattern, show 2-3 different workflows side by side before explaining. The reader recognizes the recurring shape before you name it.

**Momentum through the hard parts**: Never let more than two sections pass without the reader seeing a working result. Acknowledge difficulty without apologizing, make progress visible: "Your workflow now handles failures automatically — that's production-grade."

---

## 5. Writing Guidelines

### Voice and Tone

- Write in second person ("you")
- Be direct - state facts confidently, avoid hedging ("might", "perhaps", "seems to")
- Conversational but not casual - explain to a smart colleague, not lecture
- Short paragraphs for emphasis
- Trust the reader's intelligence

### Code Examples

- Show real, working code — never pseudocode
- Use realistic domains: lead enrichment, company research, blog evaluation, content generation, web summarization — never foo/bar/baz
- Include file path comments above code blocks: `// src/workflows/research/workflow.ts`
- Use language tags with filenames on code blocks: ````typescript workflow.ts`
- Use `<CodeGroup>` for multi-file examples (workflow.ts + steps.ts + prompt file together)
- Progressive complexity: simple example first, then add features in the next example
- When showing Claude Code–generated code, show the natural language prompt that triggered it
- Test all examples before publishing

### Formatting

Every MDX page needs frontmatter:
```yaml
---
title: "Clear, descriptive title"
description: "Concise summary for SEO/navigation"
---
```

Use language tags on all code blocks. Use relative paths for internal links (`/workflows` not full URLs). When adding a new page, add it to `docs.json` navigation so it appears in the sidebar.

### Mintlify Components

Use these components consistently. Don't invent new patterns.

| Component | When to use | Example |
|-----------|-------------|---------|
| `<Note>` | Important context that changes how the reader approaches the content | "How this tutorial works: We'll use Claude Code throughout..." |
| `<Tip>` | Optimization hints, nice-to-know info that won't break anything if skipped | "The first run downloads Docker images — this takes a few minutes." |
| `<Warning>` | Risk that should prevent or modify an action | "When using polling, set the step's `startToCloseTimeout` high enough..." |
| `<CodeGroup>` | Multi-file examples — show workflow.ts, steps.ts, and .prompt files as tabs | Getting Started code walkthrough |
| `<CardGroup>` + `<Card>` | "Next Steps" navigation at end of pages, or Do/Don't comparison layouts | Workflow Rules (Do vs Don't cards), end-of-guide navigation |
| Tables | API options, property references, comparison matrices, default values | Workflow Function options, error type references |

**Do not** use `<Info>`, `<Accordion>`, or other Mintlify components not listed above unless specifically discussed.

### Do Not

- Skip frontmatter on any MDX file
- Use absolute URLs for internal links
- Over-explain or pad content
- Use emojis unless explicitly requested
- Use corporate speak ("leverage", "utilize", "paradigm shift", "ecosystem")
- Show pseudocode or incomplete examples
- Hand-wave with "details omitted for brevity" — show the real code or don't show it
- Front-load theory in callout boxes — weave concepts into the narrative
- Use generic domains (foo, bar, baz, MyClass, doSomething)
- Add prerequisite warnings at the top of pages — assume the reader follows the learning path
- Use hedging language ("might", "perhaps", "it seems like")
- Call Output an "SDK" — Output is a framework, not an SDK

---

## 6. Documentation Writing Framework

When creating new documentation or making major revisions to existing files in this folder, you MUST follow this sequential workflow. Do not skip steps or combine them.

### Step 1: Define the Reader's Transformation
- Answer: "After reading this, the reader can ___." Write a concrete capability, not a topic summary.
- Identify which Output.ai package(s) are involved
- Determine what the reader needs to know *before* this guide and what they should *not* need to know yet

### Step 2: Persona Pressure-Test
- Walk through the guide mentally as both personas from Section 3:
  - **Beginner AI Engineer**: Where will they get stuck? What common traps does this guide touch? What's the earliest point they can see something work?
  - **Experienced AI Engineer**: Where will they skim? Where do they need depth vs. just the API surface?
- Write down what each persona needs from this documentation

### Step 3: Source Code Research
- Read the actual source code in `sdk/*/src/` to collect accurate, current information
- Review working examples in `test_workflows/src/`
- Extract real function signatures, types, and behavior
- Never document from memory or assumptions—always verify against code

### Step 4: Outline Review (User Checkpoint)
- Present a structured outline to the user before writing
- Include:
  - The reader's transformation statement ("After this, the reader can ___")
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
- Confirm the guide delivers on the transformation promise from Step 1
- Check frontmatter is complete
- Ensure links work and formatting is correct
- Final review against the "Do Not" list in Section 5

### Framework Enforcement

**CRITICAL**: This CLAUDE.md must remain in your context throughout the entire documentation creation process. Re-read relevant sections before each step if needed.

At each user checkpoint, explicitly state:
- What step you just completed
- What you learned or produced
- What you need approval for before continuing
