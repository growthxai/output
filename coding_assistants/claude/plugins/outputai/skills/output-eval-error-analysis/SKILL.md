---
name: output-eval-error-analysis
description: Systematically review workflow traces to identify failure modes before building evaluators. Use when starting an eval project, after significant pipeline changes, or when production quality drops.
allowed-tools: [Bash, Read, Write, Edit]
---

# Error Analysis for Workflow Evaluation

## Overview

Review real workflow traces and categorize how your workflow fails **before** writing any evaluators. Evaluators built without error analysis target generic qualities ("is this good?") instead of the specific ways your workflow actually breaks. This skill walks you through the process.

## When to Use

- Starting a new eval project for an existing workflow
- Production quality has dropped and you need to understand why
- After significant prompt, model, or pipeline changes
- Before building your first evaluator for a workflow

## Step 1: Collect Traces

Gather 50-100 representative workflow executions. More traces = more reliable failure categories.

### From recent runs

List recent workflow executions and pull their traces:

```bash
# List recent runs for a workflow
npx output workflow runs list <workflowName>

# Pull a specific trace as JSON
npx output workflow debug <workflowId> --format json
```

### From production (bulk download)

Download production traces directly into dataset YAML files:

```bash
# Download up to 20 recent traces as dataset files
npx output workflow dataset generate <workflowName> --download --limit 20
```

This creates YAML files in `tests/datasets/` with the `input` and `last_output` fields populated from real executions.

### From scenario-driven generation

If production traces are sparse, generate traces from scenario inputs:

```bash
# Generate a dataset from a scenario file
npx output workflow dataset generate <workflowName> basic --name basic_trace

# Generate from inline JSON
npx output workflow dataset generate <workflowName> --input '{"topic": "AI safety"}' --name ai_safety_trace
```

Run enough inputs to get 50+ traces. Prioritize diversity over volume — vary inputs across the dimensions you expect to matter.

## Step 2: Review Traces Individually

Review each trace one at a time. For each trace, record:

| Field | What to write |
|-------|---------------|
| **Trace ID** | The workflow execution ID |
| **Verdict** | Pass or Fail (binary — no "partial" at this stage) |
| **Root cause** | If Fail: what specifically went wrong and why |
| **Notes** | Anything surprising or worth remembering |

### Review template

Create a file to track your reviews. A simple markdown table works:

```markdown
# Error Analysis: <workflow_name>
# Date: YYYY-MM-DD
# Traces reviewed: 0 / 50

| # | Trace ID | Verdict | Root Cause | Notes |
|---|----------|---------|------------|-------|
| 1 | abc-123  | Fail    | Hallucinated a URL that doesn't exist | Common with technical topics |
| 2 | def-456  | Pass    | — | Clean output |
| 3 | ghi-789  | Fail    | Ignored the "formal tone" requirement | Input had conflicting signals |
```

### What to look for in each trace

Open the JSON trace and examine:

1. **Final output** — Does it meet the user's intent? Is it correct?
2. **Step-by-step data flow** — Did each step receive the right input and produce reasonable output?
3. **LLM responses** — Did the model follow instructions? Did it hallucinate?
4. **Error states** — Did any step fail, retry, or produce unexpected errors?

### Critical rule: read first, categorize second

Review at least 30 traces before naming any failure categories. Premature categorization causes you to see patterns that aren't there and miss patterns that are. Just record what you observe.

## Step 3: Group Into Failure Categories

After reviewing 30+ traces, patterns will emerge. Group your failures into 5-10 categories based on **root cause**, not surface symptoms.

### Good categories (root cause)

- "Hallucinated URLs" — model invents links that don't exist
- "Tone mismatch" — output tone doesn't match the requested persona
- "Missing required section" — output omits a section the input explicitly requested
- "Factual error" — output contains verifiably wrong claims
- "Prompt injection leak" — user input manipulates the system prompt

### Bad categories (surface symptoms)

- "Bad output" — too vague, not actionable
- "LLM error" — doesn't identify the specific failure
- "Quality issue" — could mean anything

### Splitting and merging

- If a category has fewer than 3 examples, merge it into a broader category or note it as rare
- If a category has 15+ examples and contains distinct sub-patterns, split it
- Categories should be **mutually exclusive** — each failure belongs to exactly one category

### Example categorization

For a blog generation workflow after reviewing 60 traces:

| Category | Count | Rate | Example |
|----------|-------|------|---------|
| Hallucinated URLs | 8 | 13% | Invented links to non-existent pages |
| Tone mismatch | 6 | 10% | Casual tone when formal was requested |
| Off-topic drift | 5 | 8% | Blog about "AI" drifted to unrelated ML history |
| Missing sections | 4 | 7% | Skipped "conclusion" when explicitly requested |
| Too short | 3 | 5% | Under 200 words when 500+ requested |
| **Total failures** | **26** | **43%** | |
| **Passes** | **34** | **57%** | |

## Step 4: Label Datasets

Add `ground_truth` labels to your dataset YAML files so evaluators can validate against them. Each failure category maps to a future evaluator name.

### YAML structure

```yaml
name: ai_safety_trace
input:
  topic: "AI safety"
  tone: "formal"
  min_length: 500
last_output:
  output:
    title: "Understanding AI Safety"
    blog_post: "AI safety is super important and stuff..."
  executionTimeMs: 3200
  date: '2026-03-25T00:00:00.000Z'
ground_truth:
  # Global ground truth (available to all evaluators)
  human_verdict: fail
  failure_categories:
    - tone_mismatch
  notes: "Used casual language despite formal tone request"
  # Per-evaluator ground truth
  evals:
    check_tone:
      expected_tone: formal
      verdict: fail
    check_length:
      min_length: 500
      verdict: pass
    check_hallucinated_urls:
      verdict: pass
```

The `ground_truth.evals.<evaluator_name>` fields map directly to the evaluator names you'll use in `verify()`. Each evaluator receives its own ground truth merged with the top-level ground truth via `context.ground_truth`.

### Labeling efficiently

You don't need to label every dataset for every category. Focus on:

1. Label **all** datasets with the global `human_verdict` (pass/fail)
2. Label datasets for the **top 3 failure categories** by rate
3. Add per-evaluator labels as you build each evaluator

## Step 5: Decide What to Fix vs. Evaluate

Not every failure category needs an evaluator. Use this decision tree:

```
Is this failure caused by a fixable prompt/tool gap?
├─ YES → Fix the prompt or add the missing tool first
│        Re-run error analysis after the fix
└─ NO  → Will this failure recur and need ongoing monitoring?
         ├─ YES → Build an evaluator
         │        Can it be checked with deterministic code?
         │        ├─ YES → Use Verdict.* helpers (contains, matches, gte, etc.)
         │        └─ NO  → Use judgeVerdict() with an LLM judge prompt
         └─ NO  → Document it and move on (rare edge case)
```

### Prioritize by failure rate

Build evaluators for the highest-rate failure categories first. A failure at 13% matters more than one at 2%.

### Code-based checks first

Many failures that seem subjective have objective proxies:

| Failure | Seems like... | But you can check with... |
|---------|---------------|---------------------------|
| "Too short" | Subjective | `Verdict.gte(output.length, threshold)` |
| "Missing section" | Needs LLM | `Verdict.contains(output, "## Conclusion")` |
| "Hallucinated URLs" | Needs LLM | Extract URLs with regex, verify with HTTP HEAD |
| "Wrong format" | Needs LLM | `Verdict.matches(output, expectedPattern)` |

Reserve LLM judges for genuinely subjective criteria: tone, relevance, faithfulness, coherence.

## Step 6: Map Categories to Evaluators

Create a mapping document that connects your failure categories to planned evaluators:

```markdown
# Evaluator Plan: blog_generator

| Category | Rate | Evaluator Type | Evaluator Name | Criticality |
|----------|------|----------------|----------------|-------------|
| Hallucinated URLs | 13% | Code (URL extraction + HTTP check) | check_urls | required |
| Tone mismatch | 10% | LLM judge | check_tone | required |
| Off-topic drift | 8% | LLM judge | check_topic | required |
| Missing sections | 7% | Code (string contains) | check_sections | required |
| Too short | 5% | Code (length check) | check_length | informational |
```

This becomes your implementation roadmap. Use `criticality: 'required'` for failure categories that should block a passing verdict. Use `'informational'` for nice-to-have checks.

## Next Steps

- **Build evaluators** — Follow `output-dev-eval-testing` to implement each evaluator with `verify()` and wire them into `evalWorkflow()`
- **Design judge prompts** — For LLM-based evaluators, follow `output-eval-judge-prompt` to write effective `.prompt` files
- **Expand datasets** — If your traces don't cover enough failure regions, follow `output-eval-dataset-design` to generate diverse test cases
- **Re-run after changes** — After fixing prompts, switching models, or modifying pipeline logic, repeat this error analysis to find new failure modes

## Anti-Patterns

- **Building evaluators without error analysis** — You'll evaluate the wrong things
- **Categorizing before reviewing 30+ traces** — Premature categories cause confirmation bias
- **Surface-level categories** ("bad output", "LLM error") — Split by root cause
- **One giant evaluator** — One evaluator per failure mode, not one evaluator for everything
- **Skipping code-based checks** — Don't use an LLM judge when `Verdict.contains()` works
- **Never re-running** — Error analysis is not a one-time activity; repeat after significant changes

## Related Skills

- `output-dev-eval-testing` — Implement evaluators with `verify()`, `Verdict`, and `evalWorkflow()`
- `output-eval-judge-prompt` — Design LLM judge prompts for subjective failure modes
- `output-eval-dataset-design` — Generate diverse datasets when real traces are sparse
- `output-eval-validate-judge` — Validate LLM judges against human labels
- `output-eval-audit` — Audit an existing eval suite for trustworthiness
- `output-workflow-trace` — Retrieve and analyze workflow execution traces
