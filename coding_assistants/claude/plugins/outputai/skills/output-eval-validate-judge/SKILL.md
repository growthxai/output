---
name: output-eval-validate-judge
description: Validate LLM judges against human labels using TPR/TNR metrics and train/dev/test splits. Use after writing a judge prompt to verify it agrees with human judgment.
allowed-tools: [Bash, Read, Write, Edit]
---

# Validating LLM Judges

## Overview

An LLM judge is only useful if it agrees with human judgment. This skill walks you through calibrating a judge against human-labeled data using True Positive Rate (TPR) and True Negative Rate (TNR) metrics. Do this **before** trusting any `judgeVerdict()`, `judgeScore()`, or `judgeLabel()` evaluator in your eval suite.

## Prerequisites

1. **A judge `.prompt` file** — Written following `output-eval-judge-prompt`
2. **~100 human-labeled traces** — With binary pass/fail labels for the failure mode this judge targets. Aim for ~50 pass and ~50 fail. Minimum: 20 pass and 20 fail.
3. **Labels stored in dataset YAML** — Each dataset has `ground_truth.evals.<evaluator_name>.verdict: pass` or `fail`

This process applies **only to LLM-based judges**. For code-based `Verdict.*` evaluators, write unit tests instead.

## Step 1: Create Data Splits

Split your labeled datasets into three groups:

| Split | % of Data | Purpose | Example (100 datasets) |
|-------|-----------|---------|----------------------|
| **Train** | 10-20% | Source of few-shot examples in the judge prompt | 15 datasets |
| **Dev** | 40-45% | Iterate on judge prompt, measure TPR/TNR | 42 datasets |
| **Test** | 40-45% | Final held-out measurement, run once | 43 datasets |

### Organizing splits

Use a naming convention or subdirectories to separate splits:

**Option A: Name prefixes**
```
tests/datasets/
├── train_formal_pass_01.yml
├── train_casual_fail_01.yml
├── dev_technical_pass_01.yml
├── dev_ambiguous_fail_01.yml
├── test_simple_pass_01.yml
├── test_contradictory_fail_01.yml
└── ...
```

**Option B: Subdirectories**
```
tests/datasets/
├── train/
│   ├── formal_pass_01.yml
│   └── casual_fail_01.yml
├── dev/
│   ├── technical_pass_01.yml
│   └── ambiguous_fail_01.yml
└── test/
    ├── simple_pass_01.yml
    └── contradictory_fail_01.yml
```

### Splitting rules

- **Balance pass/fail in each split** — Don't put all failures in dev and all passes in test
- **Randomize** — Don't sort by difficulty or topic
- **Training examples in the prompt** — Use only train-split examples as few-shot in the judge `.prompt` file. Never use dev or test examples — that's data leakage
- **Lock the test split** — Once created, do not look at test data until final measurement

## Step 2: Run the Judge on Dev Set

Execute the eval workflow against only the dev-split datasets:

```bash
# Run with cached output on dev datasets
npx output workflow test <workflowName> --cached \
  --dataset dev_technical_pass_01,dev_ambiguous_fail_01,dev_formal_pass_02,...
```

Or if using subdirectories, list the dev dataset names:

```bash
npx output workflow test <workflowName> --cached \
  --dataset $(ls tests/datasets/dev/ | sed 's/.yml//' | tr '\n' ',')
```

Save the output. You need the judge's verdict for each dataset to compare against ground truth.

### Extracting results

Use `--format json` to get machine-readable results:

```bash
npx output workflow test <workflowName> --cached --dataset <dev_datasets> --format json
```

The output includes per-dataset, per-evaluator verdicts that you can compare against `ground_truth.evals.<evaluator_name>.verdict`.

## Step 3: Compute TPR and TNR

For the evaluator you're validating, build a confusion matrix from the dev results.

### Definitions

Using "fail" as the positive class (what you're trying to detect):

| | Judge says Fail | Judge says Pass |
|---|---|---|
| **Human says Fail** | True Positive (TP) | False Negative (FN) |
| **Human says Pass** | False Positive (FP) | True Negative (TN) |

**TPR (True Positive Rate)** = TP / (TP + FN)
- "Of all the real failures, what fraction did the judge catch?"
- Low TPR means the judge **misses real failures** (dangerous)

**TNR (True Negative Rate)** = TN / (TN + FP)
- "Of all the real passes, what fraction did the judge correctly approve?"
- Low TNR means the judge **flags passing traces as failures** (noisy)

### Example computation

Dev set results for `check_tone` evaluator (42 datasets):

| | Judge: Fail | Judge: Pass |
|---|---|---|
| **Human: Fail** | 18 (TP) | 3 (FN) |
| **Human: Pass** | 2 (FP) | 19 (TN) |

- TPR = 18 / (18 + 3) = **85.7%**
- TNR = 19 / (19 + 2) = **90.5%**

### Why not raw accuracy?

Raw accuracy = (TP + TN) / total = (18 + 19) / 42 = 88.1%

This looks fine, but masks problems. If your dataset were 90% pass (class imbalance), a judge that always says "pass" would get 90% accuracy while catching zero failures (TPR = 0%). TPR and TNR measure what actually matters: catching failures and not crying wolf.

## Step 4: Inspect Disagreements

For every case where the judge disagrees with the human label, determine the root cause.

### False Negatives (judge missed a real failure)

The judge said "pass" but the human said "fail." For each:

1. Read the trace and the judge's critique
2. Determine why the judge missed it:
   - **Criterion too narrow** — The prompt defines failure too narrowly. Broaden the fail definition.
   - **Missing few-shot example** — The failure pattern isn't represented in examples. Add a similar borderline example from the train split.
   - **Insufficient context** — The judge doesn't have the information needed to detect this failure. Add the missing variable to the prompt.

### False Positives (judge flagged a passing trace)

The judge said "fail" but the human said "pass." For each:

1. Read the trace and the judge's critique
2. Determine why the judge flagged it:
   - **Criterion too broad** — The prompt defines failure too broadly. Tighten the fail definition.
   - **Misleading few-shot example** — A borderline example is being overgeneralized. Clarify or replace it.
   - **Overly strict** — The judge applies the criterion more strictly than intended. Add explicit exceptions to the prompt.

### Logging disagreements

Track each disagreement to guide prompt iteration:

| Dataset | Human | Judge | Root Cause | Fix |
|---------|-------|-------|------------|-----|
| dev_technical_pass_03 | pass | fail | Judge flagged "it's" as casual but context was a direct quote | Add exception: "Contractions within direct quotes are acceptable" |
| dev_ambiguous_fail_02 | fail | pass | Judge missed subtle tone shift in paragraph 3 | Add borderline few-shot example showing mid-text tone drift |

## Step 5: Iterate

Apply the fixes from Step 4 to the judge `.prompt` file. Then re-run on the dev set:

```bash
npx output workflow test <workflowName> --cached --dataset <dev_datasets>
```

Recompute TPR and TNR. Repeat until both metrics meet the target.

### Targets

| Metric | Target | Minimum Acceptable |
|--------|--------|--------------------|
| TPR | > 90% | > 80% |
| TNR | > 90% | > 80% |

If you can't reach 80%/80% after 3-4 iterations:

1. **Upgrade the model** — Switch from Haiku to Sonnet in the `.prompt` frontmatter
2. **Split the criterion** — The failure mode may contain two distinct sub-failures that need separate judges
3. **Revisit the labels** — Some human labels may be inconsistent. Re-label disagreements with a second reviewer

### Iteration checklist

Each iteration:
- [ ] Identified root cause for each disagreement
- [ ] Applied targeted fix to `.prompt` file (not random changes)
- [ ] Re-ran on dev set
- [ ] Recomputed TPR and TNR
- [ ] Logged the iteration number, changes made, and resulting metrics

## Step 6: Final Measurement on Test Set

Once dev metrics meet the target, run the judge on the held-out test set **exactly once**:

```bash
npx output workflow test <workflowName> --cached --dataset <test_datasets> --format json
```

Compute TPR and TNR on the test results. Record these as the final metrics.

### Interpreting final results

- **Test metrics close to dev metrics** — The judge generalizes well. Ship it.
- **Test metrics significantly lower** — The judge may be overfit to dev set patterns. Do not iterate on the test set. Instead, gather more labeled data, re-split, and restart from Step 2.

### Recording results

Document the final validation results alongside the judge prompt:

```markdown
# Validation: check_tone (judge_tone@v1.prompt)
# Date: 2026-03-25
# Model: claude-haiku-4-5-20251001

## Dev Set (42 datasets)
- TPR: 90.5% (19/21)
- TNR: 95.2% (20/21)

## Test Set (43 datasets)
- TPR: 88.0% (22/25)
- TNR: 94.4% (17/18)

## Conclusion: APPROVED — both metrics above 80% minimum
```

Store this in a `VALIDATION.md` file next to the judge prompt or in the evaluator's documentation.

## Anti-Patterns

- **Assuming judges work without validation** — An unvalidated judge may consistently miss failures or flag passing traces
- **Using dev/test examples as few-shot** — Data leakage inflates metrics and hides real performance
- **Optimizing for raw accuracy** — Use TPR and TNR instead; accuracy hides class imbalance problems
- **Iterating on the test set** — Test is held-out. If test metrics are bad, gather more data and re-split
- **Skipping disagreement analysis** — Random prompt tweaks without understanding root causes don't converge
- **Too few labeled examples** — Below 40 total (20 pass + 20 fail), metrics are unreliable due to small sample size

## Related Skills

- `output-eval-judge-prompt` — Design the judge prompt being validated
- `output-eval-error-analysis` — Source of human-labeled data for validation
- `output-eval-dataset-design` — Generate additional labeled datasets if you need more data
- `output-dev-eval-testing` — `output workflow test` CLI, `--cached` and `--dataset` flags
- `output-eval-audit` — Audit whether existing judges have been validated
