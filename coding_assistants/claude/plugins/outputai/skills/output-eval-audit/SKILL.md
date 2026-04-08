---
name: output-eval-audit
description: Audit an existing eval suite for trustworthiness. Use when inheriting evals, suspecting evals miss real failures, or after significant pipeline changes.
allowed-tools: [Bash, Read]
---

# Auditing an Eval Suite

## Overview

Audit your eval suite to determine whether it actually catches real failures. This skill provides a structured diagnostic that identifies gaps in error analysis, evaluator design, judge validation, and dataset coverage, with concrete remediation steps for each finding.

## When to Use

- Inheriting an eval suite from another team or developer
- Suspecting that evals pass but production quality is poor
- After switching models, rewriting prompts, or changing pipeline logic
- Periodic health check (quarterly or after major releases)

## Step 1: Gather Artifacts

Read the eval infrastructure files for the workflow being audited:

```
src/workflows/<workflow_name>/
├── tests/
│   ├── datasets/           # YAML dataset files
│   │   ├── *.yml
│   │   └── ...
│   └── evals/
│       ├── evaluators.ts   # Evaluator definitions
│       ├── workflow.ts      # Eval workflow definition
│       └── *.prompt         # Judge prompt files
```

Inventory what exists:

| Artifact | File(s) | Count |
|----------|---------|-------|
| Evaluators | `tests/evals/evaluators.ts` | ? |
| Eval workflow | `tests/evals/workflow.ts` | ? entries in `evals` array |
| Judge prompts | `tests/evals/*.prompt` | ? |
| Datasets | `tests/datasets/*.yml` | ? |
| Datasets with ground_truth | ? of above | ? |
| Datasets with last_output | ? of above | ? |

If any of these are missing entirely, note it and skip to "Starting From Zero" at the bottom.

## Step 2: Run the Diagnostic

Evaluate each of the four areas below. For each, assign a status:

- **Pass** — Meets the standard
- **Warn** — Partially meets the standard, improvements needed
- **Fail** — Does not meet the standard, significant risk

---

### Area 1: Error Analysis Grounding

**Question:** Were the evaluators derived from observed failure modes in real workflow traces?

**Check:**
- Do failure categories exist (documented in a file, comments, or commit history)?
- Does each evaluator map to a specific failure category?
- Or are evaluators measuring generic qualities ("quality score", "overall rating")?

**Pass criteria:**
- Each evaluator targets a named failure mode (e.g., "check_tone" targets tone mismatch, not "evaluate general quality")
- Failure categories were derived from reviewing real traces (not brainstormed)

**Common failures:**
- Evaluators named `evaluate_quality`, `check_overall`, `rate_output` — generic, not grounded in observed failures
- Evaluators were written based on what seemed important, not what actually fails
- No evidence of trace review before evaluator creation

**Remediation:** `output-eval-error-analysis` — Review 50+ traces and categorize actual failure modes before modifying evaluators

---

### Area 2: Evaluator Design

**Question:** Are the evaluators well-designed for reliable automated evaluation?

**Check each evaluator in `tests/evals/evaluators.ts`:**

| Check | What to look for |
|-------|------------------|
| One failure mode per judge | Each `judgeVerdict()` evaluator targets exactly one criterion |
| Binary verdicts | Judge prompts use pass/fail, not Likert scales (1-5) or multi-axis ratings |
| Code-based where possible | Objective checks use `Verdict.*` helpers, not LLM judges |
| Few-shot examples in judges | Judge `.prompt` files include pass, fail, and borderline examples |
| Critique before verdict | Judge prompts request critique/reasoning before the verdict in structured output |
| Appropriate criticality | `required` for blocking failures, `informational` for nice-to-have checks |
| Correct interpret type | `interpret` config matches what the evaluator returns |

**Pass criteria:**
- All checks above are met for every evaluator

**Common failures:**
- A single judge prompt evaluates 3+ criteria simultaneously ("Rate tone, accuracy, and completeness")
- Judge prompts have no few-shot examples
- Deterministic checks (length, string contains, regex) use LLM judges instead of `Verdict.*`
- `interpret` type doesn't match evaluator return type (e.g., `judgeVerdict()` with `interpret: { type: 'boolean' }`)

**Remediation:** `output-eval-judge-prompt` — Redesign judge prompts following the four-component structure

---

### Area 3: Judge Validation

**Question:** Have LLM judges been validated against human labels?

**Check for each LLM-based evaluator (those using `judgeVerdict()`, `judgeScore()`, `judgeLabel()`):**

| Check | What to look for |
|-------|------------------|
| Human labels exist | Datasets have `ground_truth.evals.<evaluator_name>.verdict` populated |
| TPR/TNR measured | Validation results documented (file, comment, or commit) |
| Train/dev/test split | Few-shot examples in the judge prompt come from a designated train split, not from the same data used for measurement |
| Metrics meet threshold | TPR > 80% and TNR > 80% (target: > 90%) |

**Pass criteria:**
- Every LLM judge has documented TPR/TNR metrics above 80%
- Train/dev/test split was used (no data leakage)

**Common failures:**
- No validation at all — judges were written and immediately deployed
- Few-shot examples in the judge prompt are the same examples used to measure metrics (data leakage)
- "It seems to work" without quantitative measurement
- Only raw accuracy reported (masks class imbalance)

**Remediation:** `output-eval-validate-judge` — Calibrate each judge against human labels using TPR/TNR

---

### Area 4: Dataset Coverage

**Question:** Do the datasets adequately cover the failure space?

**Check:**

| Check | What to look for |
|-------|------------------|
| Dataset count | Minimum 10 for simple workflows, 20+ for complex ones |
| Diversity | Datasets vary across multiple input dimensions, not just happy paths |
| Failure representation | At least 30% of datasets have `human_verdict: fail` in ground_truth |
| Ground truth populated | Most datasets have `ground_truth` with per-evaluator labels |
| Real + synthetic mix | Includes production traces alongside synthetic test cases |
| No near-duplicates | Each dataset tests a meaningfully different scenario |

**Pass criteria:**
- 20+ diverse datasets with ground truth
- Both pass and fail cases represented (not 95% passes)
- Datasets cover different input dimensions

**Common failures:**
- Only 3-5 datasets, all happy-path variations
- 100% of datasets pass (no failure cases to validate judges against)
- Datasets are synthetic-only with no real production traces
- Ground truth fields are empty or missing

**Remediation:** `output-eval-dataset-design` — Design diverse datasets using dimension-based variation

---

## Step 3: Compile the Report

Summarize findings in a structured format:

```markdown
# Eval Audit: <workflow_name>
# Date: YYYY-MM-DD
# Auditor: <name>

## Summary

| Area | Status | Key Finding |
|------|--------|-------------|
| Error Analysis Grounding | Warn | Evaluators seem reasonable but no documented trace review |
| Evaluator Design | Fail | Single judge evaluates 3 criteria simultaneously |
| Judge Validation | Fail | No validation performed on any LLM judge |
| Dataset Coverage | Warn | 12 datasets but only 2 are failure cases |

## Findings

### 1. Error Analysis Grounding — WARN
Evaluators target reasonable criteria (tone, topic, length) but there is no evidence
that these were derived from observed failures. The eval suite may be missing the
workflow's actual top failure modes.

**Next step:** Run error analysis on 50+ production traces (`output-eval-error-analysis`)

### 2. Evaluator Design — FAIL
`evaluate_overall_quality` in evaluators.ts uses a single judgeVerdict() call that
assesses tone, accuracy, and completeness simultaneously. This makes failures
unactionable — when it fails, you don't know which criterion failed.

**Next step:** Split into three focused judges (`output-eval-judge-prompt`)

### 3. Judge Validation — FAIL
No TPR/TNR metrics exist for any LLM judge. The judge_quality@v1.prompt has no
few-shot examples.

**Next step:** Label 100 datasets, validate each judge (`output-eval-validate-judge`)

### 4. Dataset Coverage — WARN
12 datasets exist with cached output. Only 2 have ground_truth.human_verdict: fail.
All inputs are simple topics with no edge cases.

**Next step:** Design 20+ diverse datasets (`output-eval-dataset-design`)

## Priority Order
1. Error analysis (foundational — may change which evaluators are needed)
2. Split holistic judge into focused judges
3. Expand datasets to 30+ with balanced pass/fail
4. Validate all LLM judges
```

## Starting From Zero

If the workflow has no eval infrastructure at all:

1. **Start with error analysis** — `output-eval-error-analysis`. Review 50+ workflow traces.
2. **Build datasets** — `output-eval-dataset-design`. Create 20+ diverse datasets.
3. **Implement evaluators** — `output-dev-eval-testing`. Write `verify()` evaluators and `evalWorkflow()`.
4. **Design judge prompts** — `output-eval-judge-prompt`. For subjective criteria only.
5. **Validate judges** — `output-eval-validate-judge`. Before trusting any LLM judge.

Do not skip error analysis. Building evaluators without understanding how the workflow fails wastes effort on the wrong things.

## Related Skills

- `output-eval-error-analysis` — Systematic trace review and failure categorization
- `output-eval-judge-prompt` — Design effective LLM judge prompts
- `output-eval-dataset-design` — Generate diverse test datasets
- `output-eval-validate-judge` — Calibrate LLM judges against human labels
- `output-dev-eval-testing` — Implementation reference for offline eval testing
- `output-dev-evaluator-function` — Implementation reference for runtime evaluators
