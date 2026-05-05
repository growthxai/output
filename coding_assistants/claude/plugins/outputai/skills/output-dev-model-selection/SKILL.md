---
name: output-dev-model-selection
description: Pick the right LLM model for an Output SDK prompt file. Use when writing a new .prompt file, reviewing a model choice, or upgrading a stale model. Walks through priority (reasoning/balance/speed/cost), provider selection, and a live lookup against the Vercel AI Gateway model index.
allowed-tools: Bash(curl *) Bash(jq *) Read Glob
---

# Picking a Model for an Output SDK Prompt

This skill is the single source of truth for model selection across Output SDK skills and agents. Other skills link here instead of pinning specific model IDs, because model rosters drift faster than docs.

## Live model snapshot

We run this at skill-load time to fetch the 10 most recently released models per provider from the Vercel AI Gateway:

```bash
output=$(curl -fsS https://ai-gateway.vercel.sh/v1/models 2>/dev/null | jq '
  .data as $models
  | {
      anthropic: ([ $models[] | select(.id | startswith("anthropic/")) ] | sort_by(.released) | reverse | .[0:10]),
      openai:    ([ $models[] | select(.id | startswith("openai/"))    ] | sort_by(.released) | reverse | .[0:10]),
      google:    ([ $models[] | select(.id | startswith("google/"))    ] | sort_by(.released) | reverse | .[0:10])
    }
' 2>/dev/null)
if [ -n "$output" ]; then printf '%s\n' "$output"; else echo "(snapshot unavailable)"; fi
```
### Snapshot Data
```!
output=$(curl -fsS https://ai-gateway.vercel.sh/v1/models 2>/dev/null | jq '
  .data as $models
  | {
      anthropic: ([ $models[] | select(.id | startswith("anthropic/")) ] | sort_by(.released) | reverse | .[0:10]),
      openai:    ([ $models[] | select(.id | startswith("openai/"))    ] | sort_by(.released) | reverse | .[0:10]),
      google:    ([ $models[] | select(.id | startswith("google/"))    ] | sort_by(.released) | reverse | .[0:10])
    }
' 2>/dev/null)
if [ -n "$output" ]; then printf '%s\n' "$output"; else echo "(snapshot unavailable)"; fi
```

### Snapshot Fallback
If the block above is empty, the script didn't execute automatically — likely because part of it (`jq`, `curl`, or network access) is missing. Query and filter the snapshot yourself before continuing.

## Snapshot shape

```jsonc
{
  "anthropic": [ <model>, ..., <up to 10> ],
  "openai":    [ <model>, ..., <up to 10> ],
  "google":    [ <model>, ..., <up to 10> ]
}
```

Each `<model>` is the unmodified gateway payload. Useful fields per model:

| Field | What to use it for |
|---|---|
| `id` | The provider-prefixed ID (eg `anthropic/claude-sonnet-4.6`) — translate to prompt-file form (Step 5) |
| `released` | Unix timestamp of release. Snapshot is already sorted newest-first per provider. |
| `name` | Human-readable name |
| `description` | One-paragraph capability summary — read this when comparing similarly-named tiers |
| `context_window` | Max input tokens. Matters when prompts include large context (codebases, long docs) |
| `max_tokens` | Max single-response output tokens |
| `tags` | Capability flags. `reasoning`, `tool-use`, `vision`, `file-input`, `web-search`, `image-generation`, `explicit-caching`, `implicit-caching` |
| `pricing.input` / `pricing.output` | Per-token cost (USD). Multiply by 1,000,000 for "per 1M tokens" |
| `pricing.input_cache_read` | Cached-input price — usually 10× cheaper than `input` |
| `type` | `language` for chat models; image models surface as `image-generation` and aren't valid for `.prompt` files |

## Decision flow

### Step 1 — Determine task priority

Pick the first row that fits. If unclear, default to **reasoning**.

| Priority | Use when |
|---|---|
| **reasoning** *(default)* | Complex multi-step logic, structured output extraction, judges with edge cases, anything where wrong > slow |
| **balance** | Most generative work — summarization, classification, content drafting, conversation |
| **speed** | Short interactive responses, low-latency UI loops, simple transforms |
| **cost** | Bulk batch processing where token spend dominates and quality floor is forgiving |

### Step 2 — Determine provider

Scan existing `*.prompt` files in the workflow (and its siblings under `src/workflows/`) and tally what `provider:` they declare.

- **If the workflow (or sibling workflows) already use one provider, match it.** Mixing providers means the runtime needs API keys for each — operational footgun.
- **If no existing prompts, default to `anthropic`.**
- Only switch provider when the user explicitly asks, or when a feature you need (eg Gemini's `useSearchGrounding`, OpenAI's `maxToolCalls`) is provider-specific.

### Step 3 — Map provider name to snapshot key

Output SDK `provider:` values don't always line up with the snapshot keys, since Vercel groups Gemini under `google/`:

| Output SDK provider | Snapshot key |
|---|---|
| `anthropic` | `anthropic` |
| `openai` | `openai` |
| `vertex` (Gemini models) | `google` |
| `vertex` (Claude models) | `anthropic` (then re-add the `@vertex` suffix manually) |
| `bedrock` | `anthropic` (then translate to bedrock namespace manually) |

### Step 4 — Pick a model from the provider's list

The list is already sorted newest-first. Walk it top-down and pick the first model whose `id` matches the tier for your priority.

**Skip these by default:**

- `type != "language"` (eg `gpt-image-2`, `gemini-embedding-2`) — not valid for `.prompt` files.
- IDs containing `preview`, `alpha`, or `beta`. **Use stable / GA models only**, even if a newer preview/alpha/beta exists. Only pick a non-stable model when the user explicitly asks for it ("use the preview", "I want the new beta", etc.).

| Priority | Anthropic — match `id` containing | OpenAI — match `id` | Google — match `id` |
|---|---|---|---|
| reasoning | `claude-opus-` (and `tags` includes `reasoning`) | ends with `-pro` | contains `-pro` |
| balance | `claude-sonnet-` | base `gpt-N.M` (no `-mini`/`-nano`/`-pro` suffix) | contains `-pro` |
| speed | `claude-haiku-` | ends with `-mini` | ends with `-flash` (not `-flash-lite`) |
| cost | `claude-haiku-` | ends with `-nano` | contains `-flash-lite` |

Tie-breakers when multiple stable models match:

- Prefer the unversioned alias (`claude-sonnet-4.6`) over a dated snapshot (`claude-sonnet-4-20250514`) unless reproducibility is required (eg eval judges).
- If two truly equivalent rows exist, take the one with the larger `context_window`, then lower `pricing.input`.

If **every** match in the snapshot is a preview/alpha/beta — meaning the entire tier is in pre-release — surface that to the user and ask before picking one. Don't silently use a preview because it was the only thing available.

### Step 5 — Translate the gateway ID into a prompt-file model string

Gateway IDs carry a provider prefix and use dots; prompt-file IDs strip the prefix and use hyphens. Apply two transformations: drop everything up to and including the first `/`, then replace `.` with `-`.

| Gateway `id` | Prompt-file `model:` |
|---|---|
| `anthropic/claude-sonnet-4.6` | `claude-sonnet-4-6` |
| `openai/gpt-5.5` | `gpt-5-5` |
| `google/gemini-3-flash` | `gemini-3-flash` |

Drop the translated string into your `.prompt` frontmatter:

```yaml
---
provider: anthropic
model: claude-sonnet-4-6
temperature: 0.7
maxTokens: 4096
---
```

## See also

- [`output-dev-prompt-file`](../output-dev-prompt-file/SKILL.md) — overall `.prompt` file structure
- [`output-dev-upgrade-prompt-models`](../output-dev-upgrade-prompt-models/SKILL.md) — bulk-upgrade existing prompts to the latest version of their current family
- [`output-eval-judge-prompt`](../output-eval-judge-prompt/SKILL.md) — judge-specific selection guidance (start small, escalate on TPR/TNR failures)
