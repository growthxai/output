# Output Framework Documentation Plan

Each page description below is informed by reading the actual SDK source code. Use these as content briefs for writing.

**Legend:** ✅ Complete | 🚧 Stub (needs content) | ❌ Missing | 📝 Recently updated

---

## Current Status: 24/38 pages (63%)

- ✅ **Complete:** 20 pages fully written
- 🚧 **Stubs:** 2 pages with only frontmatter (need content)
- ❌ **Missing:** 16 planned pages not created

**Last Updated:** 2026-01-31

---

## Documentation Structure

```
docs/
└── guides/
    ├── index.mdx ✅                          # Landing page with framework overview
    │
    ├── start-here/
    │   ├── getting-started.mdx ✅           # Full installation and first workflow guide
    │   ├── cli.mdx ❌                       # CLI-focused entry point (PLANNED)
    │   └── claude-code.mdx ❌               # Native Claude Code integration (PLANNED)
    │
    ├── packages/
    │   ├── core.mdx ✅                      # @outputai/core - workflow/step/evaluator
    │   ├── llm.mdx ✅ 📝                    # @outputai/llm + providerOptions docs (2026-01-31)
    │   ├── cli.mdx ✅                       # @outputai/cli - commands
    │   └── http.mdx ✅                      # @outputai/http - traced client
    │
    ├── workflows/
    │   ├── index.mdx ✅                     # Workflow fundamentals
    │   ├── context.mdx ✅                   # Execution context and control flow
    │   ├── tools.mdx ✅                     # executeInParallel utility
    │   ├── child-workflows.mdx ✅           # Composition patterns
    │   ├── webhooks.mdx ✅                  # HTTP requests and webhook handling
    │   └── scenarios.mdx ❌                 # Reusable test inputs (PLANNED)
    │
    ├── steps/
    │   └── index.mdx ✅                     # The I/O boundary
    │
    ├── prompts/ ✅ 📝                        # COMPLETE + providerOptions guide (2026-01-31)
    │   ├── index.mdx ✅ 📝                  # Prompt anatomy + Configuration Structure
    │   ├── templating.mdx ✅               # Liquid.js syntax
    │   └── best-practices.mdx ✅           # Production prompts
    │
    ├── llm/
    │   ├── index.mdx 🚧                     # Generation functions (STUB - needs content)
    │   └── providers.mdx 🚧                 # Provider configuration (STUB - needs content)
    │
    ├── evaluators/
    │   ├── index.mdx ✅                     # LLM-as-judge fundamentals
    │   └── patterns.mdx ❌                  # Runtime/async/test-time patterns (PLANNED)
    │
    ├── clients/
    │   └── index.mdx ✅ 📝                   # Writing traced API clients (2026-01-31)
    │
    ├── operations/
    │   ├── error-handling.mdx ✅            # Error handling and retry policies
    │   ├── testing.mdx ✅                   # Unit testing workflows and steps
    │   ├── tracing.mdx ✅                   # Observability and debugging
    │   ├── code-transformation.mdx ❌       # Loader documentation (PLANNED)
    │   └── deployment.mdx ❌                # Production deployment (PLANNED)
    │
    ├── api/
    │   └── index.mdx ✅                     # HTTP API endpoints and auth
    │
    └── course/ ❌                            # Progressive tutorial series (NOT STARTED)
        ├── index.mdx ❌
        ├── 01-keyword-extractor.mdx ❌
        ├── 02-article-audio.mdx ❌
        ├── 03-pexels-cover.mdx ❌
        ├── 04-key-points.mdx ❌
        ├── 05-linkedin-repurpose.mdx ❌
        ├── 06-company-research.mdx ❌
        ├── 07-tldr-quality-gate.mdx ❌
        └── 08-best-of-n.mdx ❌
```

---

## Priority Queue

### 🔥 Immediate (Fill Stubs - ~2 pages)
1. 🚧 `llm/index.mdx` - Four generation functions, when to use each
2. 🚧 `llm/providers.mdx` - Anthropic/OpenAI/Azure/Vertex setup

### ⚡ High Priority (Core Gaps - ~6 pages)
1. ❌ `start-here/claude-code.mdx` - Critical for AI-first positioning
2. ❌ `evaluators/patterns.mdx` - Runtime/async/test-time patterns
3. ❌ `workflows/scenarios.mdx` - Reusable test inputs
4. ❌ `operations/deployment.mdx` - Production deployment guide
5. ❌ `start-here/cli.mdx` - CLI-focused developer onboarding
6. ❌ `operations/code-transformation.mdx` - Loader documentation

### 🎯 Strategic (Course Content - ~9 pages)
Complete tutorial series building real workflows:
- Index + 8 progressive lessons (keyword extraction → quality gates)

---

## Getting Started

### ✅ start-here/getting-started.mdx (COMPLETE - 572 lines)

Comprehensive getting started guide covering:
- Prerequisites (Node.js, Temporal, Claude Code)
- Installation with `npx @outputai/cli init`
- Project structure walkthrough
- First workflow example with detailed explanation
- Running workflows with CLI
- Next steps and links to concepts

**Status:** Well-written, no updates needed.

---

### ❌ start-here/claude-code.mdx (MISSING)

Output is the first framework designed with AI Coding in mind. We are fully integrated with Claude Code. This page explains why and how. The philosophy: LLMs write code faster than you can drag boxes in visual builders, so Output is code-first - and Claude Code is the interface. Cover the CLAUDE.md file that ships with Output projects: it teaches Claude Code the framework's patterns, the workflow/step split, prompt file syntax, and SDK APIs. When you describe a workflow in plain English, Claude Code knows how to structure it correctly. Cover the development loop: describe what you want → Claude Code generates workflow/steps/prompt → run with CLI → iterate on the prompt or logic → Claude Code refactors. Show example prompts: "Create a workflow that researches a company and generates a summary", "Add error handling to the scrape step", "Make the LLM calls run in parallel". Cover the CLI integration: Claude Code uses `output run`, `output list`, `output status` naturally. Cover debugging: when a workflow fails, tell Claude Code "debug the last workflow run" and it reads the trace, identifies the issue, suggests fixes. This is the primary development experience - not manual coding.

---

## Core Concepts

### ❌ start-here/cli.mdx (MISSING - different from packages/cli.mdx)

**Note:** `packages/cli.mdx` exists and covers the API reference. This page should be a **teaching-focused entry point** explaining the development workflow.

The CLI is how you interact with Output - whether directly or through Claude Code. This isn't a reference page, it's a teaching page that explains the development workflow. Start with the mental model: Output projects have workflows that you develop locally and run against Temporal. The CLI bridges your code and the runtime. Cover each command in depth:

**`output init <project-name>`** - Creates a new project folder and scaffolds the complete structure. You don't need to create the folder first - the CLI creates it. Generates: `.env.example`, `.gitignore`, `package.json` with Output dependencies, `tsconfig.json`, `README.md`, `.outputai/` folder for Claude Code integration, `config/costs.yml` for pricing overrides, and `src/simple/` with an example workflow. Show the output, explain each file's purpose. Works seamlessly with VS Code Claude Code extension.

**`output dev`** - Starts the development environment. This is the command you run and leave running. It starts the Temporal worker, watches for file changes, and hot-reloads workflows. Explain what "worker" means: it's the process that executes your workflow code. Show how to read the worker logs.

**`output list`** - Discovers and lists all workflows in your project. Explain how discovery works: the CLI scans for workflow() definitions and shows their names, descriptions, input schemas. This is how Claude Code knows what workflows exist.

**`output run <workflow> --input <json|file>`** - Executes a workflow synchronously. The CLI waits for completion and prints the output. The `--input` flag accepts either inline JSON or a path to a JSON file. Show realistic examples with complex JSON input. For reusable test inputs, use scenario files: each workflow can have a `scenarios/` subfolder with JSON files (e.g., `scenarios/test_input.json`), and you run them with `output run my-workflow --input scenarios/test_input.json`. Explain what happens: the CLI starts a Temporal workflow execution, polls for completion, returns the result. Cover the `--timeout` flag for long-running workflows.

**`output start <workflow> --input <json>`** - Starts a workflow asynchronously. Returns immediately with a workflow ID. Use this for long-running workflows or when you want to monitor progress separately. The workflow continues running even if you close the terminal.

**`output status <workflowId>`** - Check if a workflow is RUNNING, COMPLETED, FAILED, or TERMINATED. Show example output for each state. Explain when to use: after `output start`, or when debugging.

**`output result <workflowId>`** - Get the output of a completed workflow. Fails if workflow is still running or failed. Use after `output start` to get results.

**`output terminate <workflowId>`** - Stop a running workflow. The workflow fails with TERMINATED status. Use when a workflow is stuck or you need to cancel. Explain that this is a hard stop - no cleanup runs.

Cover the development loop: `output dev` in one terminal (stays running), `output run` or Claude Code prompts in another. Explain environment variables: how to pass secrets for LLM providers and APIs.

---

### ✅ workflows/index.mdx (COMPLETE - 201 lines)

Covers workflow fundamentals, rules, and configuration. Already well-documented.

**Content includes:**
- Workflow definition and structure
- Determinism requirements
- Activity configuration
- Input/output schemas

**Note:** The plan below describes ideal content but this is already complete. Use as reference for future updates only.

<details>
<summary>Original plan (for reference)</summary>

Workflows are async functions that orchestrate steps. Open with the `workflow()` signature: `name` (required, alphanumeric + underscore), `inputSchema` and `outputSchema` (Zod schemas for validation), `fn` (the async function), and `options` (activity configuration). Show a real example - a company research workflow that calls `scrapeWebsite(url)`, then `analyzeTone(content)`, then `generateSummary(analysis)`. Explain why workflows must be deterministic: Temporal replays the workflow function on failures to recover state. If you call `Math.random()` or `Date.now()` directly, replay produces different values and breaks. That's why all I/O goes in steps - steps are cached and not re-executed on replay. Cover the default activity options: `startToCloseTimeout: '20m'`, retry with `initialInterval: '10s'`, `backoffCoefficient: 2.0`, `maximumAttempts: 3`. Mention that `ValidationError` and `FatalError` are non-retryable by default.

**Claude Code Integration**: Tell Claude Code "create a workflow that [does X]" and it generates the workflow.ts with proper structure, input/output schemas, and step calls. Describe the flow in plain English - "first scrape the URL, then extract key points, then generate a summary" - and Claude Code translates to the correct step sequence. When you need to modify the flow, say "add a validation step before the summary" or "make steps 2 and 3 run in parallel".

</details>

---

### ✅ workflows/context.mdx (COMPLETE - 230 lines)

Covers execution context and control flow. Already complete with sequential, parallel, conditional, and loop patterns.

---

### ❌ workflows/scenarios.mdx (MISSING)

Scenarios are reusable test inputs stored as JSON files. Each workflow can have a `scenarios/` subfolder containing JSON files that match the workflow's input schema. Run a scenario with `output run my-workflow --input scenarios/test_input.json`. Why use scenarios: (1) reproducible testing - run the same input repeatedly during development, (2) documentation - scenarios serve as examples of valid inputs, (3) CI/CD - automate workflow testing with predefined inputs. Show the folder structure: `src/my-workflow/scenarios/test_input.json`. Show a realistic scenario file matching a complex input schema. Explain naming conventions: use descriptive names like `large_article.json`, `edge_case_empty.json`. When `output init` creates a new workflow, it generates a `scenarios/test_input.json.template` file as a starting point.

---

### ✅ steps/index.mdx (COMPLETE - 230 lines)

Covers step definition, I/O operations, and patterns. Already complete.

---

### ✅ 📝 prompts/ (COMPLETE + RECENTLY UPDATED)

All three prompt pages are complete and recently updated with providerOptions clarifications:

- **index.mdx** (317 lines) - Anatomy, frontmatter, message blocks, **Configuration Structure** section added 2026-01-31
- **templating.mdx** (346 lines) - Liquid.js syntax, variables, conditionals, loops
- **best-practices.mdx** (273 lines) - System messages, temperature, structured output

**Recent additions (2026-01-31):**
- Configuration Structure section explaining config vs providerOptions
- Provider Options section with comprehensive examples
- Common Provider Options Reference table
- Vertex namespace guide (google vs anthropic vs vertex)
- Explains why `thinking` is top-level in providerOptions

**Status:** Complete and up-to-date. No further work needed.

---

### 🚧 llm/index.mdx (STUB - needs content)

**Current state:** Only frontmatter with title "LLM" and description "TDB"

**Content needed:**

`generateText` is the single function for all LLM calls. For plain text, call `generateText({ prompt, variables })`. For structured output, pass an `output` parameter: `generateText({ prompt, variables, output: Output.object({ schema }) })` returns a typed object matching the Zod schema - use for extraction, structured data. `generateText({ prompt, variables, output: Output.array({ element: schema }) })` returns an array where each element matches the schema - use for lists like keywords, action items, entities. `generateText({ prompt, variables, output: Output.choice({ options: [...] }) })` returns exactly one of the provided options - use for classification (sentiment: positive/negative/neutral, priority: high/medium/low). All calls trace automatically: request start, result with usage stats, or error details. Show the test_workflows/prompt examples: explainTopic uses generateText (plain text), generateCookingInstruction uses generateText with Output.object and a complex schema, generateDrawingInstructions uses generateText with Output.array, generateChoice uses generateText with Output.choice(['yes', 'no']). Decision tree: need free-form text? generateText. Need structured data? generateText + Output.object. Need a list? generateText + Output.array. Need classification? generateText + Output.choice.

**AI SDK Pass-Through**: All generate functions accept additional AI SDK options via rest spread. This enables: (1) **Tool calling** - pass `tools` and `toolChoice` to generateText for agent-style workflows where the model decides which tools to call, (2) **Reliability** - `maxRetries`, `abortSignal` for production resilience, (3) **Generation control** - `seed` for deterministic output, `topP`/`topK` for sampling control. Options from the prompt file can be overridden at call time. Show tool calling example with the `tool()` helper exported from the package. The response includes `toolCalls` array when tools are used. Common options table: `tools` (ToolSet), `toolChoice` ('auto'|'none'|'required'), `maxRetries` (number), `seed` (number), `abortSignal` (AbortSignal), `topP` (number), `topK` (number).

**Claude Code Integration**: Tell Claude Code "I need to call an LLM to [task]" and it chooses the right output helper. Say "extract company info into a structured object" and it uses generateText with Output.object and an appropriate schema. Say "classify this as spam or not spam" and it uses generateText with Output.choice. When the schema doesn't match what you need, tell Claude Code "add a field for sentiment score" or "make the description optional" - it updates the Zod schema. For tool calling, say "I need the model to be able to search the web" and Claude Code adds the tools configuration with proper schema.

---

### 🚧 llm/providers.mdx (STUB - needs content)

**Current state:** Only frontmatter with title "Providers" and description "TDB"

**Content needed:**

Four providers supported: Anthropic, OpenAI, Azure OpenAI, Vertex AI. Each requires environment variables: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, Azure needs its specific config, Vertex uses Google Cloud auth. Provider is set in frontmatter: `provider: anthropic`. Model is provider-specific: `model: claude-sonnet-4-20250514` for Anthropic, `model: gpt-4o-mini` for OpenAI. Switching providers: change two lines in the prompt file. The code doesn't change because the generate functions abstract the provider. Common models: Claude Haiku for fast/cheap, Claude Sonnet for balanced, GPT-4o-mini for fast OpenAI tasks. Provider-specific options go in `providerOptions` - example: Anthropic's extended thinking. Show the loadModel function's error messages for invalid providers so readers know what to expect.

**Cross-reference:** Link to `prompts/index.mdx` which now has comprehensive providerOptions documentation including namespace guidance.

---

### ✅ evaluators/index.mdx (COMPLETE - 322 lines)

Covers LLM-as-judge fundamentals, result types, and confidence scores. Already complete.

---

### ❌ evaluators/patterns.mdx (MISSING)

Three execution patterns for evaluators, each serving different use cases:

**Runtime Quality Gates (Blocking)** - The evaluator blocks workflow execution until judgment completes. Use for quality gates where the workflow must react to the evaluation result. Pattern: generate content → evaluate → if score < threshold, retry with feedback from `reasoning`. Show the retry loop pattern with `while (evaluation.value < 7 && attempts < 3)`. This adds latency but ensures quality before proceeding. Best for: user-facing outputs, critical content, anything where a bad result is worse than a slow result.

**Async Evaluation (Non-Blocking)** - Fire off evaluation without waiting for results. Currently implemented by wrapping the evaluator call in a detached child workflow: create a simple `evaluationWorkflow` that calls the evaluator and stores/reports the result, then invoke it with `{ detached: true }`. The parent workflow continues immediately. Use for: logging quality metrics, building evaluation datasets, monitoring production outputs without blocking. Show the pattern: `evaluationWorkflow({ content, evaluatorName }, { detached: true })`. Results go to traces and can be aggregated later.

**Test-Time Evaluation (Dev Only)** - Run evaluators as part of your test suite, not in production workflows. Evaluators are regular async functions - call them directly in Vitest tests. Pattern: run workflow with test input → call evaluator on the output → assert `evaluation.value` meets threshold. This lets you test LLM output quality without blocking production. Show example: `const result = await myWorkflow(testInput); const evaluation = await evaluateQuality(result.output); expect(evaluation.value).toBeGreaterThan(7);`. Use for: CI/CD quality checks, regression testing, comparing prompt versions. Combine with scenarios: run the same scenario through multiple prompt versions, evaluate each, compare scores.

Decision guide: Use runtime evaluation when the workflow must react to quality. Use async evaluation when you want metrics without latency. Use test-time evaluation when quality matters but doesn't need to affect production flow.

---

### ✅ 📝 clients/index.mdx (COMPLETE - 2026-01-31)

Comprehensive guide to building typed, observable API clients with `httpClient`. Covers:
- First client walkthrough with step integration
- Authentication patterns (Bearer, API key, Basic auth)
- Type-safe responses with Zod parsing
- Error handling (HTTPError, TimeoutError, FatalError)
- Advanced patterns (multi-method clients, async polling)
- Project organization (`src/clients/`)
- Debugging with `OUTPUT_TRACE_HTTP_VERBOSE=1`
- Complete Tavily client as production example
- Cross-references to packages/http, steps, tracing, error-handling

---

### ✅ operations/tracing.mdx (COMPLETE - 272 lines)

Covers trace lifecycle, local/remote storage, environment variables. Already complete.

---

### ✅ operations/error-handling.mdx (COMPLETE - 60 lines)

Covers error handling, retry policies, FatalError, ValidationError. Already complete.

---

### ✅ operations/testing.mdx (COMPLETE - 167 lines)

Covers unit testing workflows and steps without Temporal. Already complete.

---

### ❌ operations/code-transformation.mdx (MISSING)

**Content needed:** Documentation for Output's code transformation/loader system.

Cover how Output transforms TypeScript/JavaScript at runtime, what the loader does, and any implications for developers.

---

### ❌ operations/deployment.mdx (MISSING)

Taking Output workflows to production. This guide covers deploying your worker and connecting to managed Temporal.

**Architecture Overview**: In production you need: (1) Temporal server (managed or self-hosted), (2) Worker process running your workflows, (3) Redis for trace accumulation, (4) S3 for trace storage (optional). The worker connects to Temporal, executes workflows, and writes traces. Show the architecture diagram.

**Temporal Cloud Setup**: Create a Temporal Cloud account at cloud.temporal.io. Create a namespace (e.g., `my-company-prod`). Generate API keys or mTLS certificates. Set environment variables: `TEMPORAL_ADDRESS` (your-namespace.tmprl.cloud:7233), `TEMPORAL_NAMESPACE`, and auth credentials. Show the connection config. Temporal Cloud handles scaling, upgrades, and availability - recommended for production.

**Railway Deployment**: Railway is the easiest path to production. Create a new project, connect your Git repo. Add environment variables: all LLM API keys, `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, Temporal auth, `OUTPUT_REDIS_URL` (use Railway's Redis addon), optionally S3 credentials for remote traces (`OUTPUT_TRACE_REMOTE_ON`, `OUTPUT_TRACE_REMOTE_S3_BUCKET`, `OUTPUT_AWS_*`). The worker runs as a long-running process - Railway keeps it alive. Show the railway.json config if needed. Set up health checks. Cover scaling: Railway can run multiple worker instances for throughput.

**Alternative: Render/Fly.io**: Similar pattern - deploy as a background worker (not a web service). Show the key differences in config. Both support long-running processes and have managed Redis addons.

**Environment Variables Reference**: List all production env vars: `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_API_KEY` or mTLS paths, `OUTPUT_CATALOG_ID`, `OUTPUT_REDIS_URL`, `OUTPUT_TRACE_REMOTE_ON`, `OUTPUT_TRACE_REMOTE_S3_BUCKET`, `OUTPUT_AWS_*` (worker tracing), all LLM provider keys. Show a complete .env.production example.

**Self-Hosted Temporal**: For advanced users. Deploy Temporal server via Helm chart or docker-compose. Requires PostgreSQL or Cassandra. More operational overhead but full control. Link to Temporal's self-hosting docs. Recommendation: start with Temporal Cloud unless you have specific compliance requirements.

**Monitoring**: Temporal Cloud provides the Temporal UI for workflow visibility. Set up alerts on workflow failures. For traces, use CloudWatch or S3 lifecycle policies. Show how to query traces by workflow name and date range.

**Scaling Considerations**: Workers are stateless - run multiple instances for throughput. Temporal handles task distribution. Each worker can process multiple workflows concurrently (configurable). For high-volume: increase worker count, use dedicated task queues for different workflow types.

---

## Guides

### ❌ course/ (ENTIRE SECTION MISSING - 9 pages)

A progressive course building real workflows. Eight lessons covering: single LLM call with structured output, HTTP API integration, LLM-generated API parameters, content processing pipelines, parallel execution, search API integration, quality gates with evaluators, best-of-N selection. Prerequisites: completed Quickstart, Temporal running locally. Each lesson adds one new concept while reinforcing previous ones. By the end: you'll have built production-ready patterns for content processing, data enrichment, and quality control. The lessons map to real use cases both personas care about: keyword extraction (SEO), company research (sales), content repurposing (marketing), quality-assured summaries (product features).

#### ❌ course/index.mdx - Course overview and prerequisites

#### ❌ course/01-keyword-extractor.mdx

First workflow: extract SEO keywords from article text. Build the three files: workflow.ts defines the workflow with input (text: string) and output (keywords array with relevance scores), steps.ts defines one step that calls generateText with Output.object and a Zod schema for keyword/relevance pairs, and a prompt file that instructs the LLM to extract keywords. The schema: `z.array(z.object({ keyword: z.string(), relevance: z.number() }))`. Run it, see the structured output. Key learning: generateText + Output.object + Zod schema = reliable structured data from LLMs. The prompt file shows YAML frontmatter with provider/model/temperature. This is the "hello world" - celebrate that it works before adding complexity.

#### ❌ course/02-article-audio.mdx

Two-step workflow: scrape article, then call TTS API. First step uses httpClient to fetch article content. Second step calls an external TTS service (ElevenLabs, OpenAI TTS, etc.) with the text. Workflow orchestrates: `const text = await scrapeArticle(url); const audioUrl = await generateAudio(text); return { audioUrl };`. Key learning: httpClient for external APIs, sequential step composition. Show the client setup with prefixUrl and timeout. Show how to handle the TTS API response (usually returns a URL or binary). This demonstrates the pattern: Output workflows integrate with any HTTP API, not just LLMs.

#### ❌ course/03-pexels-cover.mdx

LLM decides what to search for. Problem: you have article content but don't know good search terms for a cover image. Solution: step 1 uses generateText with Output.object to extract `{ searchQuery: string, style: 'photo' | 'illustration' }` from content, step 2 calls Pexels API with the generated query. The LLM output becomes API input. Key learning: LLMs are good at understanding intent and translating to API parameters. Show the prompt that asks "What image would complement this article? Respond with a search query and style." Show the Pexels API call with the generated query. This pattern applies broadly: LLM generates SQL where clauses, LLM generates API filter parameters, etc.

#### ❌ course/04-key-points.mdx

Content processing with conditional logic. Input: a URL. Output: array of key points. Steps: scrape the URL, check content length, if long then chunk and process each chunk, merge results. Show the conditional: `if (content.length > 10000) { const chunks = splitIntoChunks(content); const results = await Promise.all(chunks.map(extractPoints)); return mergePoints(results); } else { return await extractPoints(content); }`. Key learning: real content is messy and variable-length. Workflows handle this with regular JavaScript conditionals. The chunking step is reusable. Show how to define a helper function that wraps step calls.

#### ❌ course/05-linkedin-repurpose.mdx

Parallel processing: one article becomes multiple LinkedIn posts. Step 1: extract 3-5 topic angles from the article using generateText with Output.array. Step 2: for each topic, select a template (educational, story, contrarian) using generateText with Output.choice. Step 3: generate all posts in parallel using Promise.all. Show the parallel pattern: `const posts = await Promise.all(topics.map(topic => generatePost(topic, template)));`. Key learning: Promise.all for concurrent step execution. Each parallel step runs as a separate Temporal activity. Show the performance benefit: 5 sequential LLM calls = 5 * 3s = 15s, parallel = 3s. Mention that parallel steps share retry boundaries - if one fails, others continue, but the Promise.all rejects.

#### ❌ course/06-company-research.mdx

Search API integration with complex structured output. Use Perplexity, Tavily, or Exa to search for company information. The output schema is complex: `{ overview: string, products: string[], targetMarket: string, recentNews: string[], competitors: string[] }`. Step 1: search API call with company name. Step 2: generateText with Output.object to structure the results into the report schema. Show the multi-section output. Key learning: search APIs + structured generation = rich data products. This is the "killer app" for operations engineers - the workflow that saves 30 minutes of manual research before every sales call. Show how to handle search API pagination or multiple queries if needed.

#### ❌ course/07-tldr-quality-gate.mdx

Generate → Evaluate → Retry pattern. Step 1: generate summary with generateText. Step 2: evaluate with an evaluator that returns EvaluationNumberResult (1-10 score) checking: covers main points, appropriate length, no hallucinations. Step 3: if score < 7 and attempts < 3, retry with feedback. Show the retry loop: `let summary = await generateSummary(content); let evaluation = await evaluateSummary(summary, content); while (evaluation.value < 7 && attempts < 3) { summary = await generateSummary(content, evaluation.reasoning); evaluation = await evaluateSummary(summary, content); attempts++; }`. Key learning: evaluators enable programmatic quality control. The reasoning field becomes feedback for the next attempt. This is the difference between demo and production - production has quality gates.

#### ❌ course/08-best-of-n.mdx

Generate variations, score, select best. Generate 3 LinkedIn post variations in parallel. Evaluate each with EvaluationNumberResult scoring engagement potential, clarity, authenticity. Select the highest-scoring variation. Show the pattern: `const variations = await Promise.all([generate(), generate(), generate()]); const scores = await Promise.all(variations.map(v => evaluate(v))); const best = variations[scores.indexOf(Math.max(...scores.map(s => s.value)))];`. Key learning: when quality matters, generate multiple and pick the best. The cost is N LLM calls, but the quality improvement is significant. Show how to return the runner-ups too for human review. This pattern applies to any generation task: email variations, ad copy, product descriptions.

---

## Notes on Existing Files Not in Original Plan

The following documentation exists but wasn't in the original plan structure:

### ✅ packages/ (4 complete pages)

- **core.mdx** (323 lines) - Comprehensive @outputai/core package documentation
- **llm.mdx** (489 lines) - @outputai/llm package with generate functions
- **cli.mdx** (442 lines) - @outputai/cli package and commands
- **http.mdx** (167 lines) - @outputai/http traced client

These are excellent API reference pages. The plan's `cli.mdx` under start-here/ should be a **teaching-focused** companion to `packages/cli.mdx`.

### ✅ workflows/ (5 complete pages)

- **context.mdx** (230 lines) - Execution context and info
- **tools.mdx** (212 lines) - executeInParallel utility
- **child-workflows.mdx** (223 lines) - Composition patterns
- **webhooks.mdx** (297 lines) - HTTP requests and webhook handling

These cover important workflow concepts not in the original plan. The plan's `control-flow.mdx` is covered by `context.mdx`.

### ✅ api/index.mdx (431 lines)

HTTP API endpoints and authentication - not in original plan but valuable addition.

---

## Writing Guidelines

When writing any of these pages, follow the principles in `/docs/guides/CLAUDE.md`:

1. **Target Personas:** Operations Engineers (automate workflows) and Product Engineers (build AI features)
2. **Problem-First Framing:** Start with the problem, then show the solution
3. **Progressive Complexity:** Simple examples first, then advanced patterns
4. **Immediate Payoff:** Readers should build something working in first 5 minutes
5. **Real, Working Code:** Test all examples before publishing

---

## Update History

- **2026-01-31:** Initial inventory and status tracking
- **2026-01-31:** Added providerOptions documentation to prompts/ section
