---
"@outputai/evals": minor
---

Switch dataset files to multi-case format where each top-level YAML key is the case name. Allows grouping multiple test cases into a single file instead of one file per case.

The old single-case format (with a top-level `name:` field) is no longer supported — existing files must be migrated to the new format. Treated as minor rather than major because adoption is still early and the migration is mechanical.

## Migration

For every `.yml` file under `tests/datasets/`:

1. Remove the top-level `name:` field.
2. Use the value of `name` as a new top-level YAML key.
3. Indent everything else by two spaces so it nests under that key.

Before:

```yaml
# tests/datasets/stripe_blog.yml
name: stripe_blog
input:
  topic: "Stripe the payment processor"
  requirements: "Include a link to https://stripe.com/en-gb/pricing"
last_output:
  output:
    title: "Stripe: The Modern Payment Processing Platform"
    word_count: 350
  executionTimeMs: 5000
ground_truth:
  notes: "Known good case"
  evals:
    length_of_output:
      min_length: 100
```

After:

```yaml
# tests/datasets/stripe_blog.yml
stripe_blog:
  input:
    topic: "Stripe the payment processor"
    requirements: "Include a link to https://stripe.com/en-gb/pricing"
  last_output:
    output:
      title: "Stripe: The Modern Payment Processing Platform"
      word_count: 350
    executionTimeMs: 5000
  ground_truth:
    notes: "Known good case"
    evals:
      length_of_output:
        min_length: 100
```

You can now group related cases into one file by adding more top-level keys:

```yaml
# tests/datasets/stripe_blog.yml
stripe_blog:
  input: { ... }
  last_output: { ... }
  ground_truth: { ... }

stripe_blog_low_quality:
  input: { ... }
  last_output: { ... }
  ground_truth: { ... }
```

Case names must be unique across every file in `tests/datasets/` — duplicates now throw instead of silently overwriting.
