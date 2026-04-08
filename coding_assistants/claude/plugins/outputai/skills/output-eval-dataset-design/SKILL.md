---
name: output-eval-dataset-design
description: Design diverse eval datasets using dimension-based variation. Use when bootstrapping eval datasets, when real traces are sparse, or when existing datasets miss edge cases.
allowed-tools: [Bash, Read, Write, Edit]
---

# Designing Eval Datasets

## Overview

Diverse datasets catch more failures. This skill teaches dimension-based dataset design — systematically varying inputs along axes that target failure-prone regions of your workflow. The output is a set of YAML dataset files ready for `output workflow test`.

## When to Use

- Bootstrapping an eval dataset for a new workflow
- Existing datasets only cover happy paths
- Real production traces are sparse (fewer than 50)
- Stress-testing specific failure hypotheses from error analysis

## When NOT to Use

- You already have 100+ representative real traces — use stratified sampling from those instead of generating synthetic data
- You haven't done error analysis yet — do that first (`output-eval-error-analysis`) so your dimensions target real failure modes, not guesses

## Step 1: Define Dimensions

Identify 3+ axes of input variation that target **anticipated failure modes**. Each dimension should vary one aspect of the input that you expect to influence output quality.

### Deriving dimensions from error analysis

Map failure categories to input properties that trigger them:

| Failure Category | Triggering Input Property | Dimension |
|-----------------|---------------------------|-----------|
| Off-topic drift | Ambiguous or broad topics | Topic specificity: specific / broad / ambiguous |
| Tone mismatch | Conflicting tone signals | Tone difficulty: simple / nuanced / contradictory |
| Too short | Short or vague input | Input detail: minimal / moderate / comprehensive |
| Missing sections | Many explicit requirements | Requirement count: 0 / 1-2 / 5+ |
| Hallucinated URLs | Technical topics with real entities | Entity density: none / few / many |

### Example dimensions for a blog generation workflow

| Dimension | Values | Why |
|-----------|--------|-----|
| Topic complexity | simple, technical, ambiguous | Technical and ambiguous topics trigger more hallucination and drift |
| Tone request | none, formal, casual, contradictory | Explicit tone requests reveal tone-matching failures |
| Length constraint | none, short (100w), long (1000w) | Extreme length constraints trigger truncation and padding |
| Required sections | none, 1 section, 3+ sections | Multiple required sections stress structural compliance |

Aim for 3-5 dimensions. More than 5 creates an unmanageable combinatorial space.

## Step 2: Draft Tuples

Create ~20 combinations of dimension values. Cover the extremes and the combinations most likely to cause failures.

### Tuple selection strategy

1. **Cover every dimension value at least twice** — ensures no blind spots
2. **Pair difficult values together** — "ambiguous topic + contradictory tone + 3+ required sections" is where failures cluster
3. **Include a few easy combinations** — confirms the workflow works under normal conditions
4. **Avoid near-duplicates** — each tuple should test a distinct scenario

### Example tuples

| # | Topic Complexity | Tone | Length | Required Sections |
|---|-----------------|------|--------|-------------------|
| 1 | simple | none | none | none |
| 2 | simple | formal | short | 1 section |
| 3 | technical | formal | long | 3+ sections |
| 4 | technical | casual | short | none |
| 5 | ambiguous | formal | long | 1 section |
| 6 | ambiguous | contradictory | none | 3+ sections |
| 7 | simple | contradictory | long | none |
| 8 | technical | none | none | 3+ sections |
| 9 | ambiguous | casual | short | 1 section |
| 10 | simple | casual | long | 3+ sections |
| 11 | technical | formal | short | 1 section |
| 12 | ambiguous | none | long | none |
| 13 | simple | formal | none | 3+ sections |
| 14 | technical | contradictory | long | 1 section |
| 15 | ambiguous | formal | short | 3+ sections |
| 16 | simple | none | short | 1 section |
| 17 | technical | casual | long | 3+ sections |
| 18 | ambiguous | contradictory | short | none |
| 19 | technical | formal | none | none |
| 20 | ambiguous | casual | long | 3+ sections |

Review each tuple and ask: "Is this a realistic scenario a user might create?" Discard any that aren't.

## Step 3: Convert Tuples to Workflow Inputs

Transform each tuple into a JSON object matching the workflow's `inputSchema` from `types.ts`.

### Read the schema first

```bash
# Find the input schema
cat src/workflows/<workflow_name>/types.ts
```

### Manual conversion (small datasets)

For each tuple, write the corresponding JSON input:

**Tuple 3:** technical + formal + long + 3+ sections

```json
{
  "topic": "Quantum error correction techniques in superconducting qubit architectures",
  "tone": "formal",
  "min_length": 1000,
  "required_sections": ["Introduction", "Technical Background", "Current Approaches", "Challenges", "Conclusion"]
}
```

**Tuple 6:** ambiguous + contradictory + none + 3+ sections

```json
{
  "topic": "Things that matter",
  "tone": "Write in a formal academic style but keep it super casual and fun",
  "required_sections": ["Overview", "Deep Dive", "Takeaways"]
}
```

Use realistic, natural-sounding inputs. Avoid test-looking data like "Test topic 1" or "Lorem ipsum."

### LLM-assisted conversion (larger datasets)

For 20+ tuples, use an LLM to batch-convert tuples into realistic inputs. Create a prompt that takes the tuple values and the `inputSchema`, then generates a natural JSON input. Review every generated input for realism before using it.

## Step 4: Generate Dataset Files

Run each input through the workflow to capture real output:

```bash
# Generate datasets one at a time
npx output workflow dataset generate blog_generator \
  --input '{"topic": "Quantum error correction", "tone": "formal", "min_length": 1000}' \
  --name technical_formal_long

npx output workflow dataset generate blog_generator \
  --input '{"topic": "Things that matter", "tone": "Write formally but keep it casual"}' \
  --name ambiguous_contradictory
```

Each command creates a YAML file in `tests/datasets/` with `input` and `last_output` populated.

### Naming convention

Use names that encode the key dimensions:

```
tests/datasets/
├── simple_no_constraints.yml
├── simple_formal_short.yml
├── technical_formal_long_sections.yml
├── technical_casual_short.yml
├── ambiguous_formal_long.yml
├── ambiguous_contradictory_sections.yml
└── ...
```

### Batch generation

For many datasets, create a shell script:

```bash
#!/bin/bash
# generate_datasets.sh

inputs=(
  '{"topic": "Solar panels", "tone": "formal"}|simple_formal'
  '{"topic": "Quantum error correction in superconducting qubits", "tone": "casual", "min_length": 1000}|technical_casual_long'
  '{"topic": "Things that matter", "required_sections": ["Overview", "Dive", "Takeaways"]}|ambiguous_sections'
)

for entry in "${inputs[@]}"; do
  IFS='|' read -r input name <<< "$entry"
  echo "Generating: $name"
  npx output workflow dataset generate blog_generator --input "$input" --name "$name"
done
```

## Step 5: Add Ground Truth

After generation, edit each dataset YAML to add `ground_truth` labels. Review the `last_output` and assign verdicts per evaluator.

```yaml
name: ambiguous_contradictory_sections
input:
  topic: "Things that matter"
  tone: "Write in a formal academic style but keep it super casual and fun"
  required_sections: ["Overview", "Deep Dive", "Takeaways"]
last_output:
  output:
    title: "Things That Matter: A Casual Academic Exploration"
    blog_post: "So here's the thing about stuff that matters..."
  executionTimeMs: 4200
  date: '2026-03-25T00:00:00.000Z'
ground_truth:
  human_verdict: fail
  notes: "Contradictory tone caused drift; missing 'Deep Dive' section"
  evals:
    check_tone:
      expected_tone: "formal academic style"
      verdict: fail
    check_topic:
      required_topic: "Things that matter"
      verdict: partial
    check_sections:
      required_sections: ["Overview", "Deep Dive", "Takeaways"]
      verdict: fail
    check_length:
      min_length: 100
      verdict: pass
```

### Labeling tips

- Label the **global `human_verdict`** for every dataset (pass/fail)
- Label the **top 3 evaluators** by failure rate first
- For borderline cases, decide and commit — don't leave ambiguous labels
- Record `notes` explaining your reasoning for future reference

## Step 6: Supplement with Real Data

If you have production traces available, use them to fill coverage gaps.

```bash
# Download production traces
npx output workflow dataset generate blog_generator --download --limit 30
```

### Stratified sampling

After downloading, check which dimensions are underrepresented:

1. Review the downloaded datasets
2. Tag each with its approximate dimension values
3. Identify gaps (e.g., no ambiguous topics, no contradictory tones)
4. Generate synthetic datasets specifically for the missing combinations

### Mixing real and synthetic

A good eval dataset combines both:
- **Real traces** (60-70%) — capture authentic user behavior and edge cases you didn't anticipate
- **Synthetic traces** (30-40%) — fill coverage gaps and stress-test specific failure regions

## Step 7: Quality Filter

Review every dataset before using it in evals.

### Discard datasets where

- The input is unrealistic or test-looking
- The input is nearly identical to another dataset (redundant)
- The workflow errored out entirely (test infrastructure issues, not quality issues)
- The ground truth labels are ambiguous or contested

### Target dataset count

| Workflow Complexity | Minimum Datasets | Target |
|--------------------|-----------------|--------|
| Simple (1-2 steps, narrow input) | 10 | 20 |
| Medium (3-5 steps, moderate variation) | 20 | 40 |
| Complex (5+ steps, wide input space) | 40 | 80+ |

More datasets improve eval reliability. Aim for at least 5 datasets per failure category to get meaningful failure rates.

## Verification

```bash
# List all datasets
npx output workflow dataset list blog_generator

# Run evals on all datasets with cached output
npx output workflow test blog_generator --cached

# Run evals on a subset
npx output workflow test blog_generator --cached --dataset technical_formal_long,ambiguous_contradictory
```

Check that:
- [ ] All datasets load without errors
- [ ] Dataset names are descriptive and encode key dimensions
- [ ] Every dataset has a `human_verdict` in `ground_truth`
- [ ] The top 3 evaluators have per-evaluator ground truth in most datasets
- [ ] Datasets cover all dimension values from your tuple table
- [ ] No two datasets are near-duplicates
- [ ] Mix of real and synthetic traces (if production data is available)

## Related Skills

- `output-eval-error-analysis` — Identify failure modes that inform dimension selection
- `output-dev-eval-testing` — Dataset YAML format, CLI commands, `evalWorkflow()` setup
- `output-dev-scenario-file` — Scenario JSON files as seed inputs for dataset generation
- `output-eval-validate-judge` — Split datasets into train/dev/test for judge validation
- `output-eval-judge-prompt` — Design LLM judge prompts that consume these datasets
