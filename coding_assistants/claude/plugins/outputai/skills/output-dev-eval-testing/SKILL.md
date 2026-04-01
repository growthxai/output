---
name: output-dev-eval-testing
description: Create offline evaluation tests for Output SDK workflows using @outputai/evals. Use when implementing test evaluators with verify(), creating dataset YAML files, building eval workflows, or running workflow tests via CLI.
allowed-tools: [Bash, Read, Write, Edit]
---

# Offline Evaluation Testing

## Overview

The `@outputai/evals` package provides an offline evaluation framework for testing workflow quality using datasets and evaluators. This is **complementary** to the runtime `evaluator()` from `@outputai/core`:

| Aspect | Runtime Evaluators (`@outputai/core`) | Offline Eval Tests (`@outputai/evals`) |
|--------|----------------------------------------|------------------------------------------|
| **When** | During workflow execution | After execution, at test time |
| **Where** | `evaluators.ts` in workflow folder | `tests/evals/` in workflow folder |
| **Purpose** | Live quality scoring with confidence | Dataset-driven pass/fail verification |
| **Triggered by** | Workflow orchestration | `output workflow test` CLI command |
| **Returns** | `EvaluationBooleanResult`, etc. | `Verdict` helpers (pass/partial/fail) |

Use offline eval testing when you want to validate workflow behavior against known datasets, build regression test suites, or assess subjective quality with LLM judges.

## When to Use This Skill

- Creating files in `tests/evals/` or `tests/datasets/`
- Writing evaluators that use `verify()` from `@outputai/evals`
- Creating YAML dataset files for test cases
- Building eval workflows with `evalWorkflow()`
- Running `output workflow test` commands
- Setting up ground truth data for evaluators

## Directory Structure

Add a `tests/` directory inside the workflow folder:

```
src/workflows/{workflow_name}/
├── workflow.ts
├── steps.ts
├── evaluators.ts          # Runtime evaluators (optional)
├── types.ts
└── tests/
    ├── datasets/
    │   ├── happy_path.yml
    │   └── edge_case.yml
    └── evals/
        ├── evaluators.ts  # Offline eval test evaluators
        ├── workflow.ts     # Eval workflow definition
        └── judge_topic@v1.prompt  # LLM judge prompts (optional)
```

## Creating Evaluators with `verify()`

Import `verify` and `Verdict` from `@outputai/evals` (not `@outputai/core`):

```typescript
// tests/evals/evaluators.ts
import { verify, Verdict } from '@outputai/evals';
import { z } from '@outputai/core';
```

### `verify()` Signature

```typescript
verify(options, checkFn)
```

**Options:**
- `name` — unique evaluator identifier (snake_case)
- `input` — Zod schema for the workflow input (optional, defaults to `z.any()`)
- `output` — Zod schema for the workflow output (optional, defaults to `z.any()`)

**Check function receives:**
```typescript
{
  input,    // typed workflow input
  output,   // typed workflow output
  context: {
    ground_truth: Record<string, unknown>  // from dataset YAML
  }
}
```

**Returns:** any `Verdict` helper result.

### Basic Example

```typescript
import { verify, Verdict } from '@outputai/evals';
import { z } from '@outputai/core';

export const evaluateSum = verify(
  {
    name: 'evaluate_sum',
    input: z.object({ values: z.array(z.number()) }),
    output: z.object({ result: z.number() })
  },
  ({ input, output }) =>
    Verdict.equals(output.result, input.values.reduce((a, b) => a + b, 0))
);
```

### Using Ground Truth

Ground truth values come from the dataset YAML and are available via `context.ground_truth`:

```typescript
export const lengthCheck = verify(
  { name: 'length_check', input: blogInput, output: blogOutput },
  ({ output, context }) =>
    Verdict.gte(output.blog_post.length, Number(context.ground_truth.min_length ?? 100))
);
```

## Verdict Helpers

All deterministic helpers return results with confidence `1.0`.

### Equality & Comparison

| Method | Description |
|--------|-------------|
| `Verdict.equals(actual, expected)` | Strict equality (`===`) |
| `Verdict.closeTo(actual, expected, tolerance)` | Within numeric tolerance |
| `Verdict.gt(actual, threshold)` | Greater than |
| `Verdict.gte(actual, threshold)` | Greater than or equal |
| `Verdict.lt(actual, threshold)` | Less than |
| `Verdict.lte(actual, threshold)` | Less than or equal |
| `Verdict.inRange(actual, min, max)` | Within inclusive range |

### String & Array

| Method | Description |
|--------|-------------|
| `Verdict.contains(haystack, needle)` | String includes substring |
| `Verdict.matches(value, pattern)` | Regex match |
| `Verdict.includesAll(actual, expected)` | Array contains all expected values |
| `Verdict.includesAny(actual, expected)` | Array contains at least one expected value |

### Boolean

| Method | Description |
|--------|-------------|
| `Verdict.isTrue(value)` | Value is `true` |
| `Verdict.isFalse(value)` | Value is `false` |

### Manual Verdicts

| Method | Description |
|--------|-------------|
| `Verdict.pass(reasoning?)` | Explicit pass |
| `Verdict.partial(confidence, reasoning?, feedback?)` | Partial pass with confidence |
| `Verdict.fail(reasoning, feedback?)` | Explicit fail |

## LLM Judge Evaluators

For subjective quality assessments, use judge functions with `.prompt` files:

```typescript
import { verify, judgeVerdict, judgeScore, judgeLabel } from '@outputai/evals';

// Returns pass/partial/fail verdict from an LLM
export const evaluateTopic = verify(
  { name: 'evaluate_topic', input: blogInput, output: blogOutput },
  async ({ input, output, context }) =>
    judgeVerdict({
      prompt: 'judge_topic@v1',
      variables: {
        blog_title: output.title,
        blog_post: output.blog_post,
        required_topic: String(context.ground_truth.required_topic ?? input.topic)
      }
    })
);

// Returns a numeric score from an LLM
export const evaluateQuality = verify(
  { name: 'evaluate_quality', input: blogInput, output: blogOutput },
  async ({ input, output }) =>
    judgeScore({
      prompt: 'judge_quality@v1',
      variables: { blog_title: output.title, blog_post: output.blog_post, topic: input.topic }
    })
);

// Returns a string label from an LLM
export const evaluateTone = verify(
  { name: 'evaluate_tone', input: blogInput, output: blogOutput },
  async ({ output }) =>
    judgeLabel({
      prompt: 'judge_tone@v1',
      variables: { blog_title: output.title, blog_post: output.blog_post }
    })
);
```

### Judge `.prompt` File Format

Judge prompt files live alongside evaluators in `tests/evals/`:

```yaml
# tests/evals/judge_topic@v1.prompt
---
provider: anthropic
model: claude-haiku-4-5-20251001
temperature: 0
maxTokens: 1000
---

<system>
You are an evaluation judge. Assess whether a blog post is faithfully about the required topic.

Return a JSON object with:
- verdict: "pass" if the blog clearly focuses on the topic, "partial" if it mentions the topic but lacks depth, "fail" if it is not about the topic
- reasoning: a brief explanation of your judgment
</system>

<user>
Required topic: {{ required_topic }}

Blog title: {{ blog_title }}

Blog post:
{{ blog_post }}

Judge whether this blog post is faithfully about the required topic.
</user>
```

## Creating Eval Workflows

The eval workflow wires evaluators together and defines how to interpret results.

```typescript
// tests/evals/workflow.ts
import { evalWorkflow } from '@outputai/evals';
import { evaluateSum } from './evaluators.js';

export default evalWorkflow({
  name: 'simple_eval',
  evals: [
    {
      evaluator: evaluateSum,
      criticality: 'required',
      interpret: { type: 'boolean' }
    }
  ]
});
```

### Eval Definition Fields

Each entry in the `evals` array has:

- **`evaluator`** — the function created by `verify()`
- **`criticality`** — `'required'` (affects pass/fail) or `'informational'` (reported but doesn't block)
- **`interpret`** — how to convert the evaluator's return value into a verdict

### Interpret Types

| Type | Evaluator Returns | Mapping |
|------|-------------------|---------|
| `{ type: 'boolean' }` | `Verdict.equals()`, `Verdict.gte()`, etc. | `true` = pass, `false` = fail |
| `{ type: 'verdict' }` | `judgeVerdict()` or `Verdict.pass/partial/fail()` | Direct pass-through |
| `{ type: 'number', pass: 0.7, partial: 0.4 }` | `judgeScore()` | `>=pass` = pass, `>=partial` = partial, else fail |
| `{ type: 'string', pass: ['a', 'b'], partial: ['c'] }` | `judgeLabel()` | Label in pass list = pass, in partial list = partial, else fail |

### Full Example with Mixed Evaluators

```typescript
export default evalWorkflow({
  name: 'blog_generator_eval',
  evals: [
    {
      evaluator: lengthOfOutput,
      criticality: 'required',
      interpret: { type: 'boolean' }
    },
    {
      evaluator: evaluateTopic,
      criticality: 'required',
      interpret: { type: 'verdict' }
    },
    {
      evaluator: evaluateQuality,
      criticality: 'required',
      interpret: { type: 'number', pass: 0.7, partial: 0.4 }
    },
    {
      evaluator: evaluateContent,
      criticality: 'informational',
      interpret: { type: 'boolean' }
    },
    {
      evaluator: evaluateTone,
      criticality: 'informational',
      interpret: { type: 'string', pass: ['professional', 'informative'], partial: ['casual'] }
    }
  ]
});
```

### Naming Convention

The eval workflow name **must** end in `_eval` and match the pattern `{workflow_name}_eval`. The CLI resolves this automatically — `output workflow test blog_generator` looks for `blog_generator_eval`.

## Dataset Files

Datasets are YAML files in `tests/datasets/`. Each file represents one test case.

### Basic Format

```yaml
name: basic_input
input:
  values:
    - 1
    - 2
    - 3
    - 4
    - 5
last_output:
  output:
    result: 15
  executionTimeMs: 100
  date: '2026-02-13T00:00:00.000Z'
```

### With Ground Truth

Ground truth provides expected values for evaluators. You can set global values and per-evaluator overrides:

```yaml
name: stripe_blog
input:
  topic: "Stripe the payment processor"
  requirements: "Include a link to https://stripe.com/en-gb/pricing"
last_output:
  output:
    title: "Stripe: The Modern Payment Processing Platform"
    blog_post: |
      Stripe has revolutionized online payment processing...
  executionTimeMs: 5000
  date: '2026-02-16T00:00:00.000Z'
ground_truth:
  notes: "Known good case"
  evals:
    length_of_output:
      min_length: 100
    evaluate_topic:
      required_topic: "Stripe the payment processor"
    evaluate_content:
      required_content: "https://stripe.com/en-gb/pricing"
```

The `ground_truth.evals.<evaluator_name>` values are merged with the top-level ground truth and passed to the evaluator via `context.ground_truth`.

## CLI Commands

### `output workflow test <workflow_name>`

Runs evaluations against all datasets for a workflow.

| Flag | Description |
|------|-------------|
| `--cached` | Use cached output from dataset files (skip workflow execution) |
| `--save` | Run workflow fresh and save output + eval results back to dataset files |
| `--dataset <names>` | Comma-separated list of dataset names to run (default: all) |
| `--format <type>` | Output format: `text` (default) or `json` |

**Execution flow:**
1. Loads all dataset YAML files from `tests/datasets/`
2. Without `--cached`: executes the workflow for each dataset to get fresh output
3. Sends all datasets to the `{workflow_name}_eval` workflow
4. Reports per-dataset and per-evaluator verdicts
5. Exits with code 1 if any required evaluator fails

### `output workflow dataset list <workflow_name>`

Lists all datasets for a workflow with their cached status.

| Flag | Description |
|------|-------------|
| `--format <type>` | Output format: `table` (default), `text`, or `json` |

### `output workflow dataset generate <workflow_name> [scenario]`

Generates a new dataset file by running the workflow.

| Flag | Description |
|------|-------------|
| `--input <json>` | Workflow input as a JSON string or file path |
| `--name <name>` | Dataset filename (defaults to scenario name) |
| `--trace <path>` | Generate from a local trace file instead of running the workflow |
| `--download` | Download traces from S3 and convert to datasets |
| `--limit <n>` | Max traces to download from S3 (default: 5) |

### Common Usage

```bash
# Generate dataset from inline JSON input
output workflow dataset generate my_workflow --input '{"key": "value"}' --name my_test

# Generate from a scenario file
output workflow dataset generate my_workflow basic

# Run evals with cached output (fast, no re-execution)
output workflow test my_workflow --cached

# Run evals fresh and save results
output workflow test my_workflow --save

# Run specific datasets only
output workflow test my_workflow --dataset happy_path,edge_case

# List all datasets
output workflow dataset list my_workflow
```

## Typical Workflow

```bash
# 1. Start the dev server
npm run output:dev

# 2. Generate datasets from real workflow runs
output workflow dataset generate blog_generator --input '{"topic": "AI"}' --name ai_post

# 3. Edit the dataset YAML to add ground_truth values for your evaluators

# 4. Run evals with --save to cache output and eval results
output workflow test blog_generator --save

# 5. Iterate on evaluators, re-run with cached output (fast)
output workflow test blog_generator --cached

# 6. List all datasets
output workflow dataset list blog_generator
```

## Verification Checklist

- [ ] Evaluators import `verify`, `Verdict` from `@outputai/evals` (not `@outputai/core`)
- [ ] Eval workflow imports `evalWorkflow` from `@outputai/evals`
- [ ] All imports use `.js` extension
- [ ] Eval workflow name follows `{workflow_name}_eval` pattern
- [ ] Dataset YAML files are in `tests/datasets/`
- [ ] Evaluator files are in `tests/evals/`
- [ ] Each evaluator has a unique `name` in snake_case
- [ ] `criticality` is set to `'required'` or `'informational'` for each eval
- [ ] `interpret` type matches evaluator return type
- [ ] Ground truth keys in dataset match evaluator names
- [ ] Judge `.prompt` files are in `tests/evals/` alongside evaluators
- [ ] `z` is imported from `@outputai/core` (not `zod`)

## Related Skills

- `output-dev-evaluator-function` — Runtime evaluators using `evaluator()` from `@outputai/core`
- `output-dev-scenario-file` — Creating scenario JSON files for workflow execution
- `output-dev-folder-structure` — Understanding project directory layout
- `output-dev-prompt-file` — Creating `.prompt` files for LLM operations
