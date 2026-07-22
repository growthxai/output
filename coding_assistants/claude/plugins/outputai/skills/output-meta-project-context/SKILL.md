---
name: output-meta-project-context
description: Comprehensive guide to Output.ai Framework for building durable, LLM-powered workflows orchestrated by Temporal. Covers project structure, workflow patterns, steps, LLM integration, HTTP clients, CLI commands, and the full inventory of available agents and skills.
allowed-tools: [Read]
---

# Output.ai Framework - Complete Project Context

## What is Output.ai?

Output.ai provides infrastructure for building production-grade AI workflows: fact checkers, content generators, data extractors, research assistants, and multi-step agents. Built on Temporal, it guarantees **durable execution** - if execution fails mid-run, it resumes from the last successful step.

## Core Philosophy

**Separation of orchestration from I/O:**
- **Workflows** orchestrate execution (must be deterministic - no I/O)
- **Steps/Evaluators** handle all I/O operations (HTTP, LLM, database calls)

This separation enables automatic retries, resumption, and debugging.

## Component Taxonomy

| Component | Purpose | Key Rule |
|-----------|---------|----------|
| **Workflow** | Orchestrates step execution | Must be deterministic (no I/O, no Date.now(), no Math.random()) |
| **Step** | Handles all I/O operations | Where HTTP, LLM, DB calls happen |
| **Evaluator** | Quality assessment | Returns confidence-scored results for validation loops |
| **Scenario** | Test input data | JSON files matching workflow's inputSchema |
| **Prompt** | LLM templates | Liquid.js templating with YAML frontmatter config |
| **Eval Test** | Offline quality testing | Dataset-driven verification with `verify()` from `@outputai/evals` |

## Project Structure

```
config/
├── credentials.yml.enc          # Global encrypted credentials
├── credentials.key              # Global decryption key (DO NOT COMMIT)
└── credentials/                 # Environment-specific credentials
    ├── production.yml.enc
    └── production.key
src/
├── shared/                      # Shared code across workflows
│   ├── clients/                 # API clients (e.g., jina.ts, stripe.ts)
│   └── utils/                   # Utility functions (e.g., string.ts)
└── workflows/                   # Workflow definitions
    └── {workflow_name}/
        ├── workflow.ts          # Orchestration logic (deterministic)
        ├── steps.ts             # I/O operations
        ├── types.ts             # Zod schemas (input, output, internal)
        ├── evaluators.ts        # Quality checks (optional)
        ├── utils.ts             # Local utilities (optional)
        ├── credentials.yml.enc  # Workflow-specific credentials (optional)
        ├── prompts/             # LLM templates (optional)
        │   └── generate@v1.prompt
        ├── scenarios/           # Test inputs (optional)
        │   └── happy_path.json
        └── tests/               # Offline eval tests (optional)
            ├── datasets/        # YAML test datasets
            │   └── happy_path.yml
            └── evals/           # Eval evaluators and workflow
                ├── evaluators.ts
                └── workflow.ts
```

## Code Reuse Rules

**Shared directory** (`src/shared/`):
- `shared/clients/` - API clients using `@outputai/http` for external services
- `shared/utils/` - Helper functions and utilities

**Allowed imports:**
- Workflows/steps can import from `../../shared/clients/*.js` and `../../shared/utils/*.js`
- Workflows/steps can import from local files (`./types.js`, `./utils.js`)

**Forbidden:**
- Importing from sibling workflow folders (`../other_workflow/steps.js`)
- Steps importing other steps (activity isolation requirement)

## Critical Rules

| Rule | Correct | Incorrect |
|------|---------|-----------|
| Zod import | `import { z } from '@outputai/core'` | `import { z } from 'zod'` |
| HTTP client | `import { httpClient } from '@outputai/http'` | `import axios from 'axios'` |
| HTTP bodies | Read with `.json()`/`.text()` or cancel unused non-HEAD bodies | Read only `response.url`/`status` and leave body open |
| Credentials | `import { credentials } from '@outputai/credentials'` | `process.env.SECRET` |
| LLM calls | `import { generateText, Output } from '@outputai/llm'` | Direct provider SDK |
| ES imports | `import { fn } from './file.js'` | `import { fn } from './file'` |
| Workflow I/O | Call steps for any I/O | Direct fetch/http in workflow |

**Determinism violations (never in workflows):**
- `Date.now()`, `new Date()`
- `Math.random()`, `crypto.randomUUID()`
- Direct HTTP/fetch calls
- File system operations
- Environment variable reads

---

## Available Tools Inventory

### Agents

| Agent | Purpose |
|-------|---------|
| `workflow-planner` | Designs workflow architecture, creates implementation blueprints |
| `workflow-debugger` | Analyzes workflow execution traces, identifies issues |
| `workflow-quality` | Reviews code quality, validates implementations |
| `workflow-prompt-writer` | Creates and optimizes LLM prompt templates |
| `workflow-context-fetcher` | Gathers documentation and existing patterns |

### Skills

#### Workflow Authoring
| Skill | Purpose |
|-------|---------|
| `output-plan-workflow` | Plan workflow architecture - **ALWAYS FIRST**, creates implementation blueprint |
| `output-build-workflow` | Build/implement workflows from a plan, or for modifications |
| `output-debug-workflow` | Debug workflow issues when workflows fail or behave unexpectedly |
| `output-migrate` | Upgrade a project between Output framework versions |

#### Workflow Operations
| Skill | Purpose |
|-------|---------|
| `output-workflow-run` | Synchronous workflow execution (waits for result) |
| `output-workflow-start` | Asynchronous workflow execution (returns ID) |
| `output-workflow-list` | List available workflows |
| `output-workflow-status` | Check async workflow status |
| `output-workflow-result` | Get async workflow result |
| `output-workflow-reset` | Rerun a workflow from after a completed step |

#### Monitoring & Debugging
| Skill | Purpose |
|-------|---------|
| `output-workflow-stop` | Stop running workflow |
| `output-workflow-trace` | Trace workflow execution |
| `output-workflow-trace-file` | Render a local trace file as readable markdown |
| `output-workflow-runs-list` | List workflow run history |
| `output-dev-workflow-cost` | Calculate cost of a workflow run |
| `output-services-check` | Verify Output services status |

#### Error Diagnosis
| Skill | Catches |
|-------|---------|
| `output-error-zod-import` | Wrong zod import source |
| `output-error-nondeterminism` | Date.now, Math.random in workflows |
| `output-error-try-catch` | Workflow try/catch patterns and typed step-error checks |
| `output-error-missing-schemas` | Incomplete Zod schema exports |
| `output-error-direct-io` | I/O operations in workflow files |
| `output-error-http-client` | Using axios instead of @outputai/http |

#### Meta/Lifecycle
| Skill | Purpose |
|-------|---------|
| `output-meta-pre-flight` | Pre-operation validation checks |
| `output-meta-post-flight` | Post-operation verification |
| `output-meta-project-context` | Load full project context (this skill) |

#### Development
| Skill | Purpose |
|-------|---------|
| `output-dev-folder-structure` | Project and workflow directory layout |
| `output-dev-code-style` | Code style conventions for workflow projects |
| `output-dev-workflow-function` | Writing deterministic workflow files |
| `output-dev-step-function` | Writing step functions for I/O |
| `output-dev-agent-class` | Build multi-step tool-loop agents with the Agent class |
| `output-dev-types-file` | Zod schema definitions |
| `output-dev-evaluator-function` | Quality assessment functions |
| `output-dev-eval-testing` | Offline eval tests with `@outputai/evals` |
| `output-dev-prompt-file` | LLM prompt templates with Liquid.js |
| `output-dev-model-selection` | Pick a current LLM model via the AI Gateway listing |
| `output-dev-upgrade-prompt-models` | Bulk-upgrade `model:` fields across `.prompt` files |
| `output-dev-scenario-file` | Test input JSON files |
| `output-dev-http-client-create` | Shared HTTP API client patterns |
| `output-dev-skill-file` | Author `.md` skill files for the framework's lazy-loaded instructions |
| `output-dev-create-skeleton` | Generate workflow skeleton |

#### Evals
| Skill | Purpose |
|-------|---------|
| `output-eval-error-analysis` | Review traces to identify failure modes before building evaluators |
| `output-eval-dataset-design` | Design diverse eval datasets via dimension-based variation |
| `output-eval-judge-prompt` | Design effective LLM judge `.prompt` files |
| `output-eval-validate-judge` | Validate LLM judges against human labels (TPR/TNR) |
| `output-eval-audit` | Audit an existing eval suite for trustworthiness |

#### Credentials
| Skill | Purpose |
|-------|---------|
| `output-dev-credentials` | Full credentials system reference (API, scopes, merging, custom providers) |
| `output-credentials-init` | Initialize encrypted credentials files for the first time |
| `output-credentials-edit` | View and edit credential values with `show`/`get`/`edit` commands |
| `output-credentials-env-vars` | Wire credentials to env vars using the `credential:` convention |

---

## CLI Quick Reference

```bash
# Development
npx output dev                              # Start dev environment

# List & inspect
npx output workflow list                    # List available workflows

# Execute
npx output workflow run <name> --input '{}'  # Run synchronously (waits)
npx output workflow start <name> --input '{}' # Run async (returns ID)
npx output workflow status <id>              # Check async status
npx output workflow result <id>              # Get async result

# Debug
npx output workflow debug <id>               # Debug failed workflow
npx output workflow debug <id> --json # Machine-readable output

# Rerun from a step (replays up to <stepName>, re-executes everything after)
npx output workflow reset <id> --step <stepName>
npx output workflow reset <id> --step <stepName> --reason "why"

# Eval Testing
npx output workflow test <name>              # Run eval tests against datasets
npx output workflow test <name> --cached     # Use cached output (fast)
npx output workflow test <name> --save       # Run fresh and save results
npx output workflow dataset list <name>      # List datasets for a workflow
npx output workflow dataset generate <name> --input '{}'  # Generate dataset

# Credentials
npx output credentials init                  # Initialize encrypted credentials
npx output credentials edit                  # Edit credentials (decrypts, opens $EDITOR)
npx output credentials show                  # Show decrypted credentials
npx output credentials get <path>            # Get single credential value
```

---

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Workflow folder | snake_case | `fact_checker/` |
| Workflow name | snake_case | `name: 'fact_checker'` |
| Step functions | camelCase | `fetchArticle()`, `analyzeContent()` |
| Schema names | PascalCase | `InputSchema`, `ArticleData` |
| Prompt files | snake_case@version.prompt | `analyze_claim@v1.prompt` |
| Scenario files | snake_case.json | `happy_path.json` |

---

## Common Patterns

### Workflow Pattern
```typescript
import { workflow, z } from '@outputai/core';
import { fetchData, processData } from './steps.js';

export const inputSchema = z.object( { url: z.string().url() } );
export const outputSchema = z.object( { result: z.string() } );

export default workflow( {
  name: 'my_workflow',
  description: 'Processes data from URL',
  inputSchema,
  outputSchema,
  fn: async input => {
    const data = await fetchData( input.url );
    const result = await processData( data );
    return { result };
  }
} );
```

See `output-dev-workflow-function` for comprehensive patterns.

### Step Pattern
```typescript
import { step, z } from '@outputai/core';
import { httpClient } from '@outputai/http';

export const fetchData = step(
  { name: 'fetchData', inputSchema: z.string(), outputSchema: z.any() },
  async url => {
    const client = httpClient( { prefixUrl: url } );
    const response = await client.get( '' );
    return response.json();
  }
);
```

See `output-dev-step-function` for comprehensive patterns.

### HTTP Client Pattern (Shared)

Clients live in `src/shared/clients/` and are shared across all workflows.

```typescript
// src/shared/clients/example.ts
import { FatalError, ValidationError } from '@outputai/core';
import { httpClient } from '@outputai/http';
import { credentials } from '@outputai/credentials';

const API_KEY = credentials.require( 'example.api_key' );

const client = httpClient( {
  prefixUrl: 'https://api.example.com',
  headers: { Authorization: `Bearer ${API_KEY}` },
  timeout: 30000,
  retry: { limit: 3, statusCodes: [ 408, 429, 500, 502, 503, 504 ] }
} );

export async function fetchFromExample( query: string ): Promise<ExampleResponse> {

  try {
    const response = await client.get( 'endpoint', { searchParams: { q: query } } );
    return response.json();
  } catch ( error: unknown ) {
    const err = error as { status?: number; message?: string };
    if ( err.status === 401 || err.status === 403 ) {
      throw new FatalError( `Auth failed: ${err.message}` );
    }
    throw new ValidationError( `Request failed: ${err.message}` );
  }
}
```

**Error type guidelines:**
- `FatalError`: 401, 403, 404 (won't succeed on retry)
- `ValidationError`: 429, 5xx (may succeed on retry)

See `output-dev-http-client-create` for comprehensive patterns.

### Evaluator Pattern

Evaluators return confidence-scored results. Three result types available:

```typescript
import { evaluator, z, EvaluationBooleanResult, EvaluationNumberResult, EvaluationStringResult } from '@outputai/core';

// Boolean evaluator - pass/fail checks
export const evaluateCompleteness = evaluator( {
  name: 'evaluate_completeness',
  description: 'Check if content meets minimum length',
  inputSchema: z.object( { content: z.string(), minLength: z.number() } ),
  fn: async ( { content, minLength } ) => {
    return new EvaluationBooleanResult( {
      value: content.length >= minLength,
      confidence: 1.0,
      reasoning: `Content has ${content.length} chars (min: ${minLength})`
    } );
  }
} );
```

See `output-dev-evaluator-function` for comprehensive patterns.

### Prompt File Pattern

Prompts use YAML frontmatter + Liquid.js templating. Location: `src/workflows/{name}/prompts/`

```
---
provider: anthropic
# current as of 2026-05-04 — run output-dev-model-selection for the latest
model: claude-sonnet-4-6
temperature: 0.7
maxTokens: 4096
---

<system>
You are an expert content analyzer.

{% if context %}
Additional context: {{ context }}
{% endif %}
</system>

<user>
Analyze the following content:

<content>
{{ content }}
</content>

Provide {{ numberOfPoints | default: 3 }} key insights.
</user>
```

**Using in steps:**
```typescript
import { generateText, Output } from '@outputai/llm';
import { z } from '@outputai/core';

// Structured output
const { output } = await generateText( {
  prompt: 'analyze@v1',
  variables: { content: 'Article text...', numberOfPoints: 5 },
  output: Output.object( {
    schema: z.object( { insights: z.array( z.string() ) } )
  } )
} );

// Text output
const { result } = await generateText( {
  prompt: 'summarize@v1',
  variables: { content: 'Article text...' }
} );
```

**Provider & model selection:** the SDK supports `anthropic`, `openai`, `vertex`, `bedrock`, `azure`, and `perplexity` (the registered list lives in the SDK's model registry, `sdk/llm/src/ai_model.js`). Don't pin specific model IDs in docs — they drift. To pick a current model, run [`output-dev-model-selection`](../output-dev-model-selection/SKILL.md), which queries the AI Gateway model index live.

See `output-dev-prompt-file` for comprehensive patterns.

---

## Practical Tips

### Docker & Services
- **Restart worker after adding workflows**: `docker restart <project>-worker-1`
- **View worker logs**: `docker logs -f output-worker-1`
- **Check services**: Use `output-services-check` skill

### Payload Limits
- Temporal: ~2MB per workflow input/output
- gRPC: ~4MB maximum
- For larger data, use file storage and pass references

### Debugging Workflow Failures
1. Get the workflow ID from error output
2. Run `npx output workflow debug <id> --json`
3. Look for: failed step name, error message, input that caused failure
4. Check if issue is determinism, schema validation, or external API
