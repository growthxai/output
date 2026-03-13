# Output

The open-source TypeScript framework for building AI workflows and agents. Designed for Claude Code — describe what you want, Claude builds it, with all the best practices already in place.

One framework. Prompts, evals, tracing, cost tracking, orchestration, credentials. No SaaS fragmentation. No vendor lock-in. Everything in your codebase, everything your AI coding agent can reach.

## Why Output

Every piece of the AI stack is becoming a separate subscription. Prompts in one tool. Traces in another. Evals in a third. Cost tracking across five dashboards. None of them talk to each other. Half of them will get acquired or shut down before your product ships.

Output brings everything together. One TypeScript framework, extracted from thousands of production AI workflows. Best practices baked in so beginners ship professional code from day one, and experienced AI engineers stop rebuilding the same infrastructure.

### Build AI using AI

Output is the first framework designed for AI coding agents. The entire codebase is structured so Claude Code can scaffold, plan, generate, test, and iterate on your workflows. Every workflow is a folder — code, prompts, tests, evals, traces, all together. Your agent reads one folder and has full context.

### Own your prompts

`.prompt` files with YAML frontmatter and Liquid templating. Version-controlled, reviewable in PRs, deployed with your code. Switch providers by changing one line. No subscription needed to manage your own prompts.

### See everything that happens

Every LLM call, HTTP request, and step traced automatically. Token counts, costs, latency, full prompt/response pairs. JSON in `logs/runs/`. Zero config. Claude Code analyzes your traces and fixes issues — because the data is in your file system.

### Test AI like software

LLM-as-judge evaluators with confidence scores. Inline evaluators for production retry loops. Offline evaluators for dataset testing. Deterministic assertions and subjective quality judges.

### Use any model

Anthropic, OpenAI, Azure, Vertex AI, Bedrock. One API. Structured outputs, streaming, tool calling — all work the same regardless of provider.

### Scale without worrying

Temporal under the hood. Automatic retries with exponential backoff. Workflow history. Replay on failure. Child workflows. Parallel execution with concurrency control. You don't think about Temporal until you need it — then it's already there.

### Keep secrets secret

AI apps need a lot of API keys. Sharing `.env` files is risky, and coding agents shouldn't see your secrets. Output encrypts credentials with AES-256-GCM, scoped per environment and workflow, managed through the CLI. No external vault subscription needed.

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- An LLM API key (e.g. [Anthropic](https://console.anthropic.com/))

### Create your project

```bash
npx @outputai/cli init
cd <project-name>
```

Add your API key to `.env`:
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

### Start developing

```bash
npx output dev
```

This starts the full development environment:
- Temporal server for workflow orchestration
- API server for workflow execution
- Worker with hot reload for your workflows
- Temporal UI at http://localhost:8080

### Run your first workflow

```bash
npx output workflow run blog_evaluator paulgraham_hwh
```

Inspect the execution:
```bash
npx output workflow debug <workflow-id>
```

For the full getting started guide, see the [documentation](docs/guides/start-here/getting-started.mdx).

## Core Concepts

### Workflows

Orchestration layer — deterministic coordination logic, no I/O.

```javascript
// src/workflows/research/workflow.ts
workflow({
  name: 'research',
  fn: async (input) => {
    const data = await gatherSources(input);
    const analysis = await analyzeContent(data);
    const quality = await checkQuality(analysis);
    return quality.passed ? analysis : await reviseContent(analysis, quality);
  }
});
```

### Steps

Where I/O happens — API calls, LLM requests, database queries. Each step runs once and its result is cached for replay.

```javascript
// src/workflows/research/steps.ts
step({
  name: 'gatherSources',
  fn: async (input) => {
    const results = await searchApi(input.topic);
    return { sources: results };
  }
});
```

### Prompts

`.prompt` files with YAML configuration and Liquid templating.

```yaml
---
provider: anthropic
model: claude-sonnet-4-20250514
temperature: 0
---

<system>You are a research analyst.</system>
<user>Analyze the following sources about {{ topic }}: {{ sources }}</user>
```

### Evaluators

LLM-as-judge evaluation with confidence scores and reasoning.

```javascript
// src/workflows/research/evaluators.ts
evaluator({
  name: 'checkQuality',
  fn: async (content) => {
    const { output } = await generateText({
      prompt: 'evaluate_quality',
      variables: { content },
      output: Output.object({
        schema: z.object({
          isQuality: z.boolean(),
          confidence: z.number().describe('0-100'),
          reasoning: z.string()
        })
      })
    });

    return new EvaluationBooleanResult({
      value: output.isQuality,
      confidence: output.confidence,
      reasoning: output.reasoning
    });
  }
});
```

## SDK Packages

| Package | Description |
|---------|-------------|
| **[@outputai/core](sdk/core)** | Workflow, step, and evaluator primitives |
| **[@outputai/llm](sdk/llm)** | Multi-provider LLM with prompt management |
| **[@outputai/http](sdk/http)** | HTTP client with tracing |
| **[@outputai/cli](sdk/cli)** | CLI for project init, dev environment, and workflow management |

## Example Workflows

See [test_workflows/](test_workflows/) for complete examples:

- **[Simple](test_workflows/src/workflows/simple)** — Basic workflow with steps
- **[HTTP](test_workflows/src/workflows/http)** — API integration with HTTP client
- **[Prompt](test_workflows/src/workflows/prompt)** — LLM generation with prompts
- **[Evaluation](test_workflows/src/workflows/evaluation)** — Quality evaluation workflows
- **[Stream Text](test_workflows/src/workflows/stream_text)** — Streaming text generation

## Configuration

### LLM Providers

```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=...
AWS_ACCESS_KEY_ID=...        # For Amazon Bedrock
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

### Temporal

For local development, `output dev` handles everything. For production, use [Temporal Cloud](https://temporal.io/cloud) or self-hosted Temporal:

```bash
TEMPORAL_ADDRESS=your-namespace.tmprl.cloud:7233
TEMPORAL_NAMESPACE=your-namespace
TEMPORAL_API_KEY=your-api-key
```

### Tracing

```bash
# Local tracing (writes JSON to disk; default under "logs/runs/")
OUTPUT_TRACE_LOCAL_ON=true

# Remote tracing (upload to S3 on run completion)
OUTPUT_TRACE_REMOTE_ON=true
OUTPUT_REDIS_URL=redis://localhost:6379
OUTPUT_TRACE_REMOTE_S3_BUCKET=my-traces
```

## Contributing

```bash
git clone https://github.com/growthxai/output-sdk.git
cd output-sdk
pnpm install && npm run build:packages
```

```bash
npm run dev           # Start dev environment
npm test              # Run tests
npm run lint          # Lint code
./run.sh validate     # Validate everything
```

**Project structure:**
- `sdk/` — SDK packages (core, llm, http, cli)
- `api/` — API server for workflow execution
- `test_workflows/` — Example workflows

## License

Apache 2.0 — see [LICENSE](LICENSE) file.

## Acknowledgments

Built with [Temporal](https://temporal.io), [Vercel AI SDK](https://sdk.vercelai), [Zod](https://zod.dev), [LiquidJS](https://liquidjs.com).
