---
name: output-dev-upgrade-prompt-models
description: Bulk-upgrade the model field across .prompt files to the latest version of each prompt's existing family. Use when prompt models have drifted (eg sonnet-4 → sonnet-4-6), after a long pause between framework updates, or as part of a periodic model-freshness pass. Within-family only — never changes provider or tier.
allowed-tools: [Bash, Read, Edit, Glob]
---

# Upgrade Prompt Models In-Place

Walks every `.prompt` file in a project (or scoped subtree), classifies each model into its provider+family bucket, looks up the latest stable model in that bucket via the [`output-dev-model-selection`](../output-dev-model-selection/SKILL.md) snapshot, and rewrites the `model:` line. Provider and family tier are preserved — a Haiku stays a Haiku, an Anthropic stays an Anthropic.

This skill explicitly does **not** swap providers or escalate tiers (eg Haiku → Sonnet). Those are deliberate human decisions handled separately.

## When to invoke

- A periodic refresh: "upgrade all my prompt models to the latest"
- After a long break between framework updates, where dated snapshot IDs (eg `claude-sonnet-4-20250514`) have aged out
- Right after creating a new project from the CLI scaffolder, to pull every templated default forward to the current best

## Workflow

### Step 1 — Discover

Find every `.prompt` file under the target scope. Default scope is the project's `src/` tree; the user may scope to a single workflow.

### Step 2 — Parse current model

For each file, read the YAML frontmatter (between the first pair of `---` lines) and pull out `provider:` and `model:`.

### Step 3 — Classify family

Match the existing model into a family bucket. Family is preserved across the upgrade.

| Pattern | Family |
|---|---|
| `claude-opus-*` | `anthropic-opus` |
| `claude-sonnet-*` | `anthropic-sonnet` |
| `claude-haiku-*` | `anthropic-haiku` |
| `gpt-*-pro` | `openai-pro` |
| `gpt-*-mini` | `openai-mini` |
| `gpt-*-nano` | `openai-nano` |
| `gpt-N.M` (no suffix) | `openai-default` |
| `gemini-*-flash-lite*` | `google-flash-lite` |
| `gemini-*-flash*` | `google-flash` |
| `gemini-*-pro*` | `google-pro` |

If a model doesn't match any pattern, skip the file and log a warning. Do not guess.

### Step 4 — Look up latest in family

For each prompt, find the latest stable model in the same family by following [`output-dev-model-selection`](../output-dev-model-selection/SKILL.md) — fetch its snapshot, apply its filter rules (skip preview/alpha/beta, prefer unversioned aliases), and translate the chosen `id` to prompt-file form.

Use this family → snapshot-key + `id` regex map to pin the lookup to the existing tier:

| Family | Snapshot key | `id` regex |
|---|---|---|
| `anthropic-opus` | `anthropic` | `claude-opus-` |
| `anthropic-sonnet` | `anthropic` | `claude-sonnet-` |
| `anthropic-haiku` | `anthropic` | `claude-haiku-` |
| `openai-pro` | `openai` | `-pro$` |
| `openai-default` | `openai` | `^openai/gpt-[0-9.]+$` |
| `openai-mini` | `openai` | `-mini$` |
| `openai-nano` | `openai` | `-nano$` |
| `google-pro` | `google` | `-pro` (excluding `-flash`) |
| `google-flash` | `google` | `-flash$\|-flash-[0-9]` |
| `google-flash-lite` | `google` | `-flash-lite` |

If no stable match exists for a family (only pre-release entries available), surface that to the user and skip the file rather than guessing or downgrading to a different family.

**Bail loudly on a failed snapshot.** If the snapshot fetch itself returned nothing — network down, gateway shape changed, `curl` or `jq` missing — abort the run before Step 5. Do **not** continue with an empty snapshot and report "no upgrades needed", because that lies: the prompts weren't actually checked. Tell the user the snapshot fetch failed, point them at the manual-fallback steps in [`output-dev-model-selection`](../output-dev-model-selection/SKILL.md), and exit.

### Step 5 — Diff & confirm

Build a per-file report comparing the current model to the resolved `latest`:

```
src/workflows/foo/prompts/bar@v1.prompt   claude-sonnet-4-20250514  →  claude-sonnet-4-6
src/workflows/foo/prompts/baz@v1.prompt   claude-haiku-4-5          ✓ already latest
```

Print the full report. **Wait for explicit user confirmation before writing.** In CI / non-interactive contexts, default to dry-run.

### Step 6 — Edit

For each confirmed file, edit only the YAML frontmatter:

- Replace the `model:` line with the resolved latest ID.
- If a `# current as of YYYY-MM-DD …` comment is present (the convention used in `output-dev-prompt-file` examples and CLI scaffolds), update its date to today's (`date +%Y-%m-%d`). Match the comment by the literal `current as of ` prefix and only rewrite the date — leave the trailing text intact.
- Leave `provider:`, `temperature:`, `maxTokens:`, `providerOptions:`, and the message body untouched.

Refreshing the dated comment in the same edit keeps the "as of" convention coherent — without it, an upgraded prompt would have a fresh model paired with a stale date.

### Step 7 — Verify

After the batch:

- Spot-check a handful of files to confirm the YAML still has a frontmatter delimiter and message body.
- Run the project's lint and build (`pnpm run lint`, `pnpm run build:packages` from the repo root).

The Output SDK doesn't validate prompt model IDs at build time ([sdk/llm/src/ai_model.js](../../../../../sdk/llm/src/ai_model.js)) — invalid IDs only surface at first run. If smoke-tests are available, run at least one workflow per upgraded family.

## Caveats

- **Within-family only.** This skill never upgrades Sonnet → Opus, never swaps Anthropic for OpenAI. To change tier or provider, edit prompts manually or use [`output-dev-prompt-file`](../output-dev-prompt-file/SKILL.md).
- **Dated snapshots get bumped.** A pin like `claude-sonnet-4-20250514` becomes the unversioned alias `claude-sonnet-4-6`. If the pin was load-bearing for reproducibility, surface that and skip the file.
- **`@vertex` and `bedrock` namespace suffixes.** Models like `claude-sonnet-4-20250514@vertex` or `anthropic.claude-sonnet-4-20250514-v1:0` need manual upgrade. The AI Gateway listing covers direct provider IDs only.
- **Models.dev pricing lag.** Even after the upgrade, `calculateLLMCallCost` may return `total: null` for the brand-new model until [models.dev](https://models.dev) catches up. The runtime call still works.

## See also

- [`output-dev-model-selection`](../output-dev-model-selection/SKILL.md) — canonical snapshot + selection rules this skill consumes
- [`output-dev-prompt-file`](../output-dev-prompt-file/SKILL.md) — `.prompt` file structure
