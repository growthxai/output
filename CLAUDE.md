# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the Output.ai (often referred as just Output) framework codebase.

## Project Overview

Output.ai is an AI framework for building reliable production-ready LLM workflows & agents. It contains multiple NPM packages and supporting infrastructure with best AI engienering practices baked-in. Under the hood, the Output framework uses Temporal.io as the execution layer.

## Documentation References

- **Project setup & commands**: See [README.md](README.md)
- **Workflow structure & examples**: See [README.md#workflow-structure](README.md#workflow-structure)
- **Framework packages**:
  - Core: [sdk/core/README.md](sdk/core/README.md)
  - LLM: [sdk/llm/README.md](sdk/llm/README.md)
  - Prompt: [sdk/prompt/README.md](sdk/prompt/README.md)
- **Test examples**: See [test_workflows/](test_workflows/) directory

## Tech Stack Context

- Runtime: Node.js 24.3 with ES modules
- Workflow orchestration: Temporal
- LLM providers: Anthropic, OpenAI (via AI SDK)
- Testing: Vitest
- Containerization: Docker Compose

## Environment Variables

Configuration is documented in:

- Root environment: [README.md#env-file](README.md#env-file)
- Workflow secrets: Required in `test_workflows/.env`

## Package Management

This monorepo uses **pnpm workspaces** with a `pnpm-workspace.yaml` and `pnpm-lock.yaml`.

### Docker Builds

The API Dockerfile uses `pnpm install --frozen-lockfile --filter output-api` to install only API dependencies from the root lockfile.

## Available Sub Agent Experts

This project requires coordination between multiple technical domains. Use these specialized agents:

### 🟣 `temporal-expert`

**When to use:**

- Designing workflow/activity boundaries in Output.ai abstractions
- Implementing retry policies and error handling patterns
- Handling workflow determinism and versioning
- Optimizing worker performance and task queues
- Testing Temporal workflows with Output.ai patterns

**Key questions for this project:**

- How to structure activities within Output's abstraction layer?
- Best practices for error handling in workflow wrappers?
- Optimal patterns for LLM integration within Temporal workflows?

### 🤖 `llm-expert`

**When to use:**

- Using the output-llm module within workflow steps
- Designing LLM workflow patterns and error handling
- Managing prompt templates with LiquidJS
- Optimizing LLM API costs and performance
- Handling LLM response streaming and retries

**Key questions for this project:**

- How to use the output-llm module within Output steps?
- Best practices for LLM integration through the isolated output-llm module?
- Optimal prompt template management strategies?

### 🌐 `api-expert`

**When to use:**

- Express server design and middleware configuration
- API endpoint design for workflow execution
- Workflow discovery and listing functionality
- Error handling and response formatting

**Key questions for this project:**

- Best practices for workflow execution APIs? (see api/README.md for current routes)
- How to implement workflow discovery with static file interpretation?

### 🟢 `nodejs-expert`

**When to use:**

- ES module configuration and imports (JavaScript & TypeScript)
- TypeScript configuration, build tooling, and type system
- NPM package structure for monorepos with JS/TS projects
- Build configuration and dependency management
- Performance optimization for Node.js workflows

**Key questions for this project:**

- How to configure TypeScript for new packages in the monorepo?
- Optimal build tooling for JavaScript and TypeScript packages?

### 🟡 `testing-expert`

**When to use:**

- Testing Temporal workflows with Vitest
- Mocking output-llm module responses and external APIs
- Integration testing for workflow execution
- Testing prompt template rendering
- Performance testing for workflow scenarios

**Key questions for this project:**

- Testing strategies for Output workflow abstractions?
- How to mock the output-llm module effectively?
- Best practices for Temporal workflow testing with Vitest?

### 🟦 `docker-expert`

**When to use:**

- Containerizing Output workers and API server
- Docker Compose setup for local development
- Multi-stage builds for Node.js applications
- Container networking for Temporal services
- Volume management for workflow data

**Key questions for this project:**

- How to containerize Temporal workers with Output?
- Best practices for Node.js container optimization?
- Optimal Docker Compose setup for dev environment?

## When Working on This Project

1. Check existing documentation before implementing new features
2. Follow patterns in `test_workflows/` for new workflows
3. Maintain TypeScript definitions alongside JavaScript implementations
4. Use ES module syntax throughout
5. All external operations should be wrapped inside Temporal activities (steps)
6. Call the related sub agents and use the provided experts when needed. If you're not sure which sub agent to use, ask for help, or ask Claude which sub agent would be the most helpful.
7. Always ask the user if they would like to update the documentation after any new changes.
8. Always base your code on to existing code patterns and project hierarchical organization;
9. Write production code: Optimized, Explicit and Succinct (NOT verbose);
10. Don't over use comments;
11. Follow best code practices: DRY, KISS, YAGNI; When they make sense.
12. Prefer a functional approach over an object-oriented approach; Avoid using classes/inheritance unless absolutely necessary.
13. DO NOT opt out of linting rules or change the linting rules unless specifically requested by the user.
14. Use snake_case for all file names and folder names.

## Writing .prompt Files: ProviderOptions Guide

When creating `.prompt` files, understanding the `providerOptions` structure is critical.

### Decision Tree: Where Does This Option Go?

```
Is it a standard AI SDK option (temperature, maxTokens, topP, etc.)?
├─ YES → Top-level config (alongside provider and model)
└─ NO → providerOptions

In providerOptions:
├─ Is it 'thinking' or 'order'? → Top-level (special AI SDK features)
└─ Is it provider-specific? → Nested under provider namespace
```

### Common Mistakes to Avoid

❌ **Mistake 1: Putting provider options at top-level**
```yaml
provider: anthropic
effort: medium          # WRONG: 'effort' is not a standard option
```

✅ **Correct:**
```yaml
provider: anthropic
providerOptions:
  anthropic:
    effort: medium
```

---

❌ **Mistake 2: Nesting `thinking` under provider**
```yaml
providerOptions:
  anthropic:
    thinking:           # WRONG: thinking is top-level
      type: enabled
```

✅ **Correct:**
```yaml
providerOptions:
  thinking:             # Correct: top-level special key
    type: enabled
```

---

❌ **Mistake 3: Wrong namespace for Vertex Gemini**
```yaml
provider: vertex
model: gemini-2.0-flash
providerOptions:
  vertex:               # WRONG: Gemini uses 'google' namespace
    useSearchGrounding: true
```

✅ **Correct:**
```yaml
provider: vertex
model: gemini-2.0-flash
providerOptions:
  google:               # Correct: Gemini is a Google model
    useSearchGrounding: true
```

---

❌ **Mistake 4: Confusing standard and provider options**
```yaml
providerOptions:
  anthropic:
    temperature: 0.7    # WRONG: temperature is standard, goes top-level
    effort: medium
```

✅ **Correct:**
```yaml
temperature: 0.7        # Standard: top-level
providerOptions:
  anthropic:
    effort: medium      # Provider-specific: nested
```

### Quick Reference: Common Provider Options

**Anthropic (Claude)**
```yaml
provider: anthropic
providerOptions:
  anthropic:
    effort: medium      # low | medium | high
```

**OpenAI**
```yaml
provider: openai
providerOptions:
  openai:
    maxToolCalls: 1
    reasoningEffort: high
```

**Vertex with Gemini**
```yaml
provider: vertex
model: gemini-2.0-flash
providerOptions:
  google:               # Note: 'google', not 'vertex'
    useSearchGrounding: true
```

**Vertex with Claude**
```yaml
provider: vertex
model: claude-sonnet-4-20250514@vertex
providerOptions:
  anthropic:            # Note: 'anthropic', not 'vertex'
    effort: medium
```

**Amazon Bedrock**
```yaml
provider: bedrock
model: anthropic.claude-sonnet-4-20250514-v1:0
maxTokens: 64000              # Recommended: Bedrock has no client-side defaults
providerOptions:
  bedrock:                    # Note: 'bedrock', not 'anthropic'
    guardrailConfig:
      guardrailIdentifier: my-guardrail
      guardrailVersion: "1"
```

**Extended Thinking (any provider)**
```yaml
providerOptions:
  thinking:             # Top-level, not nested
    type: enabled
    budgetTokens: 10000
```

### Why This Structure Exists

AI SDK uses `Record<string, Record<string, JSONValue>>` for `providerOptions` to:
1. **Prevent collisions** - `anthropic.effort` and `openai.reasoningEffort` can coexist
2. **Support multi-provider** - Pass options to multiple providers in one call
3. **Route correctly** - AI SDK extracts each provider's options independently

The nesting is intentional architecture, not redundancy.

## Schema Constraints for LLM Structured Output

When using `Output.object()` with `generateText`, the Zod schema is converted to JSON Schema and sent to the LLM provider as a tool definition. **Anthropic does not support `minimum`/`maximum` JSON Schema constraints** on number fields, which means `.min()` and `.max()` on `z.number()` will cause errors or be silently ignored.

### Rule: Use `.describe()` instead of `.min()/.max()` for LLM output schemas

```typescript
// LLM output schema - sent to provider via Output.object()
output: Output.object( {
  schema: z.object( {
    score: z.number().describe( 'Quality score 0-100' )  // Correct
  } )
} )
```

```typescript
// Workflow/evaluator validation schema - Zod-only, NOT sent to LLM
export const workflowOutputSchema = z.object( {
  score: z.number().min( 0 ).max( 100 ).describe( 'Quality score 0-100' )  // Correct
} );
```

### When to use which

| Context | `.min()/.max()` | `.describe()` |
|---------|:-:|:-:|
| Schema passed to `Output.object()` | No | Yes |
| `inputSchema` / `outputSchema` on workflows | OK | Optional |
| `outputSchema` on evaluators | OK | Optional |
| `workflowOutputSchema` in types.ts | OK | Optional |

The `.describe()` annotation guides the LLM on expected ranges. The `.min()/.max()` constraints are for runtime Zod validation only and should be used on schemas that validate data within your application, not schemas sent to LLM providers.

## How to confirm you've made changes successfully

### Confirming the code is valid

- From the root directory, run `npm run lint`
- From the root directory, run `npm run build:packages`

### Confirming the code is working

- From the root directory, run `npm test`
- From the root directory, run `npm run start:worker`
- From the root directory, run `./run.sh validate`

### Confirming the system is working

- From the root directory, run `./run.sh dev`
  - And from a separate terminal, run `curl -X POST http://localhost:3001/workflow -H "Content-Type: application/json" -d '{"workflowName": "simple", "input": {"values": [1, 2, 3, 4, 5]}}'`
