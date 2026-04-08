---
name: output-eval-judge-prompt
description: Design effective LLM judge .prompt files for evaluators. Use when creating judgeVerdict/judgeScore/judgeLabel prompts, or when existing judges produce unreliable results.
allowed-tools: [Read, Write, Edit]
---

# Designing LLM Judge Prompts

## Overview

An LLM judge evaluates workflow output for a **single, specific failure mode** identified during error analysis. This skill covers how to design the `.prompt` file that powers `judgeVerdict()`, `judgeScore()`, or `judgeLabel()` calls. For the file format basics, see `output-dev-prompt-file`. For error analysis, see `output-eval-error-analysis`.

## Prerequisites

Before writing a judge prompt:

1. **Error analysis is complete** — You have identified the specific failure mode this judge targets (from `output-eval-error-analysis`)
2. **20+ labeled examples** — At least 20 pass and 20 fail traces for this failure mode, with `ground_truth` labels in dataset YAML files
3. **Code-based check ruled out** — Confirmed that `Verdict.*` helpers (contains, matches, gte, etc.) cannot reliably detect this failure

## The Four Components

Every effective judge prompt has exactly four components.

### 1. Task and Criterion

State the single failure mode being evaluated. Be specific and observable.

**Good criteria (specific, observable):**
- "Does the blog post maintain a formal tone throughout, or does it slip into casual language?"
- "Does the output contain any URLs that are fabricated rather than drawn from the input?"
- "Does the summary faithfully represent the source material without adding claims not present in the original?"

**Bad criteria (vague, holistic):**
- "Is this output high quality?"
- "Rate the overall effectiveness of this response"
- "How good is this content?"

### 2. Pass/Fail Definitions

Define exactly what constitutes pass and fail. **Always binary** — no Likert scales, no 1-5 ratings, no "partially meets criteria."

```
PASS: The blog post uses formal language throughout. Professional vocabulary,
complete sentences, no slang, no contractions, no first-person casual asides.

FAIL: The blog post contains one or more instances of casual language: slang,
contractions ("don't", "can't"), informal asides ("pretty cool", "super important"),
or conversational filler ("honestly", "basically").
```

Why binary: Likert scales create ambiguous boundaries (what's the difference between a 3 and a 4?). Binary forces precise definitions that LLMs can apply consistently and that you can validate against human labels.

### 3. Few-Shot Examples

Include at least three labeled examples: one clear pass, one clear fail, and one borderline case. **Borderline examples are the most valuable** — they teach the judge where the decision boundary lies.

Draw examples from your **training split only** (see `output-eval-validate-judge`). Never use dev or test examples as few-shot — that's data leakage.

Each example must include:
- The relevant input/output excerpt
- A detailed critique explaining the reasoning
- The verdict (pass or fail)

### 4. Structured Output

Request JSON output with **critique before verdict**. This forces the judge to reason before deciding, which improves accuracy.

```json
{
  "critique": "Detailed analysis of the output against the criterion...",
  "verdict": "pass"
}
```

Always put `critique` first in the schema. If `verdict` comes first, the judge commits to a decision before reasoning.

## Full `.prompt` File Example

A judge for the "tone mismatch" failure mode:

```
# tests/evals/judge_tone@v1.prompt
---
provider: anthropic
model: claude-haiku-4-5-20251001
temperature: 0
maxTokens: 1500
---

<system>
You are an evaluation judge. Your task is to determine whether a blog post maintains the requested tone throughout.

## Criterion

Assess whether the blog post consistently uses the requested tone. A single paragraph that breaks tone is a failure.

## Definitions

PASS: The blog post maintains the requested tone in every paragraph. Word choice, sentence structure, and rhetorical style all align with the requested tone.

FAIL: The blog post contains one or more paragraphs where the tone shifts away from what was requested. Common failures include:
- Formal request but casual language appears ("pretty cool", "super important", contractions)
- Professional request but opinionated editorializing appears
- Technical request but oversimplified explanations appear

## Examples

### Example 1: PASS
Requested tone: formal
Blog excerpt: "The implications of quantum computing for cryptographic security are substantial. Current encryption standards rely on the computational infeasibility of factoring large prime numbers, a guarantee that quantum algorithms may undermine."
Critique: The excerpt uses professional vocabulary ("implications", "computational infeasibility"), complete sentences, no contractions, and maintains an academic register. Consistent formal tone throughout.
Verdict: pass

### Example 2: FAIL
Requested tone: formal
Blog excerpt: "Quantum computing is basically going to break all our encryption. It's pretty wild when you think about it — everything we thought was secure might not be."
Critique: The excerpt contains multiple casual markers: "basically", "pretty wild", contractions ("It's", "might not be"), and conversational filler ("when you think about it"). This directly violates the formal tone request.
Verdict: fail

### Example 3: BORDERLINE (fail)
Requested tone: formal
Blog excerpt: "Quantum computing represents a paradigm shift in computational capability. The technology is incredibly promising, though it's important to note the current limitations in qubit stability and error correction."
Critique: Mostly formal, but contains "incredibly promising" (informal intensifier) and "it's" (contraction). While the overall register is professional, these lapses break the formal tone requirement. Even minor inconsistencies constitute a failure.
Verdict: fail

## Output Format

Return a JSON object with exactly two fields:
- "critique": A detailed analysis (3-5 sentences) citing specific evidence from the blog post
- "verdict": Either "pass" or "fail"
</system>

<user>
Requested tone: {{ requested_tone }}

Blog title: {{ blog_title }}

Blog post:
{{ blog_post }}

Evaluate whether this blog post consistently maintains the requested tone.
</user>
```

## Wiring to `judgeVerdict()`

After creating the `.prompt` file, wire it to an evaluator using `verify()` and `judgeVerdict()`:

```typescript
// tests/evals/evaluators.ts
import { verify, judgeVerdict } from '@outputai/evals';
import { z } from '@outputai/core';
import { blogInput, blogOutput } from './schemas.js';

export const checkTone = verify(
  {
    name: 'check_tone',
    input: blogInput,
    output: blogOutput
  },
  async ({ input, output, context }) =>
    judgeVerdict({
      prompt: 'judge_tone@v1',
      variables: {
        requested_tone: String(context.ground_truth.expected_tone ?? input.tone ?? 'professional'),
        blog_title: output.title,
        blog_post: output.blog_post
      }
    })
);
```

Then add it to the eval workflow:

```typescript
// tests/evals/workflow.ts
import { evalWorkflow } from '@outputai/evals';
import { checkTone } from './evaluators.js';

export default evalWorkflow({
  name: 'blog_generator_eval',
  evals: [
    {
      evaluator: checkTone,
      criticality: 'required',
      interpret: { type: 'verdict' }
    }
  ]
});
```

## Choosing What Context to Pass

Feed the judge only what it needs to evaluate the criterion. Extra context adds noise and cost.

| Failure Mode | Required Variables | Not Needed |
|-------------|-------------------|------------|
| Tone mismatch | requested_tone, blog_post | topic, input constraints |
| Off-topic drift | topic, blog_post | tone, length requirements |
| Hallucinated claims | blog_post, source_material | topic, tone |
| Faithfulness | summary, original_document | formatting requirements |
| Missing requirements | requirements_list, blog_post | topic (unless relevant) |

Use `context.ground_truth` for expected values that vary per dataset. Use `input.*` for values from the workflow input. Use `output.*` for the workflow output being evaluated.

## `judgeScore()` Variant

Use `judgeScore()` when you need a numeric quality score rather than binary pass/fail. Apply the same four-component design.

### `.prompt` file for scoring

```
# tests/evals/judge_quality@v1.prompt
---
provider: anthropic
model: claude-haiku-4-5-20251001
temperature: 0
maxTokens: 1500
---

<system>
You are an evaluation judge. Score the overall writing quality of a blog post on a scale of 0.0 to 1.0.

## Scoring Criteria

- 0.0-0.3: Major issues — incoherent, riddled with errors, or completely off-topic
- 0.4-0.6: Mediocre — readable but has significant quality issues (poor structure, weak arguments, factual gaps)
- 0.7-0.8: Good — well-structured, clear, minor issues only
- 0.9-1.0: Excellent — polished, engaging, publication-ready

## Output Format

Return a JSON object with:
- "critique": Detailed analysis of quality strengths and weaknesses (3-5 sentences)
- "score": A number between 0.0 and 1.0
</system>

<user>
Topic: {{ topic }}

Blog title: {{ blog_title }}

Blog post:
{{ blog_post }}

Score the writing quality of this blog post.
</user>
```

### Wiring to `judgeScore()`

```typescript
export const checkQuality = verify(
  { name: 'check_quality', input: blogInput, output: blogOutput },
  async ({ input, output }) =>
    judgeScore({
      prompt: 'judge_quality@v1',
      variables: {
        topic: input.topic,
        blog_title: output.title,
        blog_post: output.blog_post
      }
    })
);
```

In the eval workflow, use `interpret: { type: 'number' }` with thresholds:

```typescript
{
  evaluator: checkQuality,
  criticality: 'required',
  interpret: { type: 'number', pass: 0.7, partial: 0.4 }
}
```

## `judgeLabel()` Variant

Use `judgeLabel()` when you need classification into named categories.

```typescript
export const checkToneLabel = verify(
  { name: 'check_tone_label', input: blogInput, output: blogOutput },
  async ({ output }) =>
    judgeLabel({
      prompt: 'judge_tone_label@v1',
      variables: {
        blog_title: output.title,
        blog_post: output.blog_post
      }
    })
);
```

In the eval workflow, use `interpret: { type: 'string' }` with label lists:

```typescript
{
  evaluator: checkToneLabel,
  criticality: 'informational',
  interpret: { type: 'string', pass: ['professional', 'formal'], partial: ['casual'] }
}
```

## Model Selection

| Model | When to Use | Cost |
|-------|-------------|------|
| `claude-haiku-4-5-20251001` | Default for most judges. Fast, cheap, good at following structured instructions. | Low |
| `claude-sonnet-4-6` | Complex reasoning required (faithfulness checking, multi-step logical analysis). | Medium |
| `claude-opus-4-6` | Only if Sonnet fails validation. Rarely needed. | High |

Always set `temperature: 0` for judges. Reproducibility matters more than creativity.

Start with Haiku. If the judge fails validation (TPR/TNR below 80%), move to Sonnet before rewriting the prompt — the model upgrade alone often fixes it.

## Anti-Patterns

- **Vague criteria** ("Is this good?") — Target one specific, observable failure mode
- **Holistic judges** ("Rate overall quality on 5 dimensions") — One judge per failure mode
- **No few-shot examples** — Always include pass, fail, and borderline examples
- **Likert scales** (1-5 ratings) — Use binary pass/fail for verdict judges; use 0.0-1.0 with defined bands for score judges
- **Verdict before critique** — Put critique first in the JSON schema to force reasoning
- **Skipping validation** — Always validate judges against human labels (`output-eval-validate-judge`)
- **Kitchen-sink context** — Pass only the variables the judge needs for its criterion
- **Few-shot from dev/test set** — Only use training-split examples to avoid data leakage

## Related Skills

- `output-eval-error-analysis` — Identify the failure mode this judge targets
- `output-dev-eval-testing` — Implementation reference for `verify()`, `judgeVerdict()`, `evalWorkflow()`
- `output-dev-prompt-file` — `.prompt` file format, Liquid.js templating, provider configuration
- `output-eval-validate-judge` — Validate this judge against human labels after writing it
- `output-eval-dataset-design` — Generate diverse datasets for judge validation
