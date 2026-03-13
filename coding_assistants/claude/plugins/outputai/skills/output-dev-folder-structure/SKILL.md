---
name: output-dev-folder-structure
description: Workflow folder structure conventions for Output SDK. Use when creating new workflows, organizing workflow files, or understanding the standard project layout.
allowed-tools: [Read, Glob]
---

# Workflow Folder Structure Conventions

## Overview

This skill documents the standard folder structure for Output SDK workflows. Following these conventions ensures consistency across the codebase and enables proper tooling support.

## When to Use This Skill

- Creating a new workflow from scratch
- Reorganizing an existing workflow
- Understanding where to place different file types
- Reviewing workflow structure for compliance

## Standard Project Structure

```
src/
├── shared/                          # Shared code across workflows
│   ├── clients/                     # API clients (using @output.ai/http)
│   ├── utils/                       # Utility functions & helpers
│   ├── services/                    # Business logic services
│   ├── steps/                       # Shared steps (optional)
│   └── evaluators/                  # Shared evaluators (optional)
└── workflows/
    └── {workflow-name}/             # Individual workflow directory
        ├── workflow.ts              # Workflow definition (REQUIRED)
        ├── steps.ts                 # OR steps/ folder
        ├── evaluators.ts            # OR evaluators/ folder (optional)
        ├── types.ts                 # Zod schemas and TypeScript types
        ├── utils.ts                 # Workflow-specific utilities (optional)
        ├── prompts/                 # LLM prompt templates (optional)
        │   └── {promptName}@v1.prompt
        └── scenarios/               # Test input scenarios (optional)
            └── {scenario_name}.json
```

## File Purposes

### workflow.ts (Required)
- Contains the main `workflow()` function definition
- Default exports the workflow
- Must be deterministic - no direct I/O operations
- Orchestrates step calls

**Related Skill**: `output-dev-workflow-function`

### steps.ts or steps/ folder (Required)
- Contains all `step()` function definitions
- Handles all I/O operations (HTTP, LLM, file system, etc.)
- Named exports for each step function
- Includes error handling with FatalError and ValidationError

**Related Skill**: `output-dev-step-function`

### evaluators.ts or evaluators/ folder (Optional)
- Contains `evaluator()` function definitions
- Used for workflow quality assessment and validation
- Named exports for each evaluator function

### types.ts (Required)
- Contains Zod schemas for input/output validation
- Exports TypeScript types derived from schemas
- Imports `z` from `@output.ai/core` (never from `zod`)

**Related Skill**: `output-dev-types-file`

### utils.ts (Optional)
- Contains pure helper functions
- No I/O operations - those belong in steps
- Shared utility logic for the workflow

### prompts/ folder (Optional)
- Contains `.prompt` files for LLM operations
- File naming: `{promptName}@v1.prompt`
- Uses YAML frontmatter and Liquid.js templating

**Related Skill**: `output-dev-prompt-file`

### scenarios/ folder (Optional)
- Contains JSON test input files
- File naming: `{scenario_name}.json`
- Matches workflow inputSchema structure

**Related Skill**: `output-dev-scenario-file`

## Organization Options

### Option 1: Flat Files (Recommended for smaller workflows)

```
src/workflows/{workflow-name}/
├── workflow.ts
├── steps.ts           # All steps in one file
├── evaluators.ts      # All evaluators in one file (optional)
├── types.ts
└── ...
```

### Option 2: Folder-Based (For larger workflows)

```
src/workflows/{workflow-name}/
├── workflow.ts
├── steps/             # Steps split into individual files
│   ├── fetch_data.ts
│   ├── process.ts
│   └── validate.ts
├── evaluators/        # Evaluators split into individual files
│   ├── quality.ts
│   └── accuracy.ts
├── types.ts
└── ...
```

## Component Location Rules (Strict)

The Output SDK enforces strict rules about where components can be defined:

| Component | Must be in |
|-----------|------------|
| `step()` calls | Files containing 'steps' in path |
| `evaluator()` calls | Files containing 'evaluators' in path |
| `workflow()` calls | `workflow.ts` file |

**Examples:**
- `src/workflows/my_workflow/steps.ts` ✓
- `src/workflows/my_workflow/steps/fetch_data.ts` ✓
- `src/shared/steps/common_steps.ts` ✓
- `src/workflows/my_workflow/helpers.ts` ✗ (cannot contain step() calls)

## Import Rules (Activity Isolation)

Steps and evaluators are Temporal activities with isolation constraints to ensure deterministic replay.

### Steps CAN import from:
- Local workflow files: `./utils.js`, `./types.js`, `./helpers.js`
- Local subdirectories: `./clients/pokeapi.js`, `./lib/helpers.js`
- Shared utilities: `../../shared/utils/*.js`
- Shared clients: `../../shared/clients/*.js`
- Shared services: `../../shared/services/*.js`

### Steps CANNOT import:
- Other steps (activity isolation)
- Evaluators
- Workflow files

### Evaluators follow the same rules:
- CAN import local files and shared code
- CANNOT import other evaluators, steps, or workflows

**Import Pattern Examples:**
```typescript
// From workflow steps.ts - importing shared client
import { GeminiImageService } from '../../shared/clients/gemini_client.js';

// From workflow steps.ts - importing local utility
import { formatResponse } from './utils.js';

// From workflow steps.ts - importing types
import { InputSchema, OutputSchema } from './types.js';

// WRONG - steps cannot import other steps
import { otherStep } from '../../shared/steps/other.js'; // ✗
```

## Shared Resources

### src/shared/clients/
HTTP clients shared across workflows:

```
src/shared/clients/
├── gemini_client.ts     # Google Gemini API client
├── jina_client.ts       # Jina AI client
└── perplexity_client.ts # Perplexity API client
```

Import pattern in workflow steps:
```typescript
import { GeminiImageService } from '../../shared/clients/gemini_client.js';
```

**Related Skill**: `output-dev-http-client-create`

### src/shared/utils/
Utility functions shared across workflows:

```
src/shared/utils/
├── string_helpers.ts
├── date_formatters.ts
└── validators.ts
```

### src/shared/services/
Business logic services shared across workflows:

```
src/shared/services/
├── image_service.ts
└── content_service.ts
```

### src/shared/steps/ (Optional)
Shared steps that can be imported by workflows:

```
src/shared/steps/
└── common_steps.ts
```

Note: Workflows import shared steps, but steps cannot import other steps directly.

## Naming Conventions

### Folder Names
- Use `snake_case` for workflow folder names
- Example: `image_infographic_nano`, `resume_parser`

### File Names
- Use `camelCase` for `.ts` files (except `workflow.ts`, `steps.ts`, `types.ts`, `evaluators.ts`)
- Use `camelCase@v{n}` for `.prompt` files
- Use `snake_case` for `.json` scenario files

### Workflow Names
- The `name` property in `workflow()` should be camelCase
- Example: `imageInfographicNano`

## Example: Complete Workflow Structure

```
src/workflows/image_infographic_nano/
├── workflow.ts              # workflow({ name: 'imageInfographicNano', ... })
├── steps.ts                 # generateImageIdeas, generateImages, validateReferenceImages
├── types.ts                 # WorkflowInputSchema, WorkflowOutput, step schemas
├── utils.ts                 # normalizeReferenceImageUrls, buildS3Url, etc.
├── prompts/
│   └── generateImageIdeas@v1.prompt
└── scenarios/
    ├── test_input_complex.json
    └── test_input_solar_panels.json
```

## Verification Checklist

When reviewing workflow structure, verify:

- [ ] `workflow.ts` exists with default export
- [ ] `steps.ts` or `steps/` folder exists with all step definitions
- [ ] `types.ts` exists with Zod schemas
- [ ] All `.ts` imports use `.js` extension
- [ ] `prompts/` folder exists if LLM operations are used
- [ ] `scenarios/` folder exists with at least one test input
- [ ] Folder naming follows `snake_case` convention
- [ ] Workflow name in code follows `camelCase` convention
- [ ] Steps only import allowed dependencies (local files, shared code)
- [ ] No cross-component imports (steps don't import other steps)

## Related Skills

- `output-dev-workflow-function` - Writing workflow.ts files
- `output-dev-step-function` - Writing step functions
- `output-dev-evaluator-function` - Writing evaluators.ts files
- `output-dev-types-file` - Creating Zod schemas
- `output-dev-prompt-file` - Creating prompt files
- `output-dev-scenario-file` - Creating test scenarios
- `output-dev-http-client-create` - Creating shared HTTP clients
