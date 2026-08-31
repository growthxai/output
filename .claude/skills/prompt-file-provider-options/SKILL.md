---
name: prompt-file-provider-options
description: Guide to the providerOptions structure in .prompt files — decision tree for where an option goes, common mistakes, per-provider quick reference, and Anthropic prompt caching. Use when writing or reviewing .prompt file frontmatter (provider, model, providerOptions, messageOptions).
---

## Writing .prompt Files: ProviderOptions Guide

When creating `.prompt` files, understanding the `providerOptions` structure is critical.

### Decision Tree: Where Does This Option Go?

```
Is the key on the prompt config allowlist (provider, model, temperature, maxOutputTokens, deprecated maxTokens, topP, topK, presencePenalty, frequencyPenalty, stopSequences, seed, maxSteps, skills, tools, providerOptions, messageOptions, n, maxImagesPerCall, size, aspectRatio)?
├─ YES -> Top-level config
└─ NO -> Nest under providerOptions (unknown top-level keys throw; snake_case aliases like max_output_tokens fail with a camelCase suggestion)

In providerOptions:
├─ Is it 'thinking' or 'order'? -> Top-level (special AI SDK features)
└─ Is it provider-specific? -> Nested under provider namespace
```

Use `maxOutputTokens` for new prompts. Deprecated `maxTokens` remains on the loaded config and populates `maxOutputTokens` when the canonical key is absent; when both are set, `maxOutputTokens` takes precedence.

### Common Mistakes to Avoid

❌ **Mistake 1: Putting provider options at top-level**
```yaml
provider: anthropic
effort: medium          # WRONG: 'effort' is not a standard option
```

✅ **Correct:**
```yaml
provider: anthropic
providerOptions:
  anthropic:
    effort: medium
```

---

❌ **Mistake 2: Nesting `thinking` under provider**
```yaml
providerOptions:
  anthropic:
    thinking:           # WRONG: thinking is top-level
      type: enabled
```

✅ **Correct:**
```yaml
providerOptions:
  thinking:             # Correct: top-level special key
    type: enabled
```

---

❌ **Mistake 3: Wrong namespace for Google Vertex Gemini**
```yaml
provider: google-vertex
model: gemini-2.0-flash
providerOptions:
  vertex:               # WRONG: Gemini uses 'google' namespace
    useSearchGrounding: true
```

✅ **Correct:**
```yaml
provider: google-vertex
model: gemini-2.0-flash
providerOptions:
  google:               # Correct: Gemini is a Google model
    useSearchGrounding: true
```

---

❌ **Mistake 4: Confusing standard and provider options**
```yaml
providerOptions:
  anthropic:
    temperature: 0.7    # WRONG: temperature is standard, goes top-level
    effort: medium
```

✅ **Correct:**
```yaml
temperature: 0.7        # Standard: top-level
providerOptions:
  anthropic:
    effort: medium      # Provider-specific: nested
```

---

❌ **Mistake 5: Unknown or snake_case top-level keys**
```yaml
provider: openai
max_output_tokens: 16000 # WRONG: snake_case alias of maxOutputTokens
reasoningEffort: medium # WRONG: OpenAI-specific
```

✅ **Correct:**
```yaml
provider: openai
maxOutputTokens: 16000
topP: 0.9
providerOptions:
  openai:
    reasoningEffort: medium
```

Unknown top-level keys throw `Invalid prompt file`. A snake_case alias of a known field fails with a suggestion (`max_output_tokens` -> use `maxOutputTokens`). Nested `providerOptions` stays open.

### Quick Reference: Common Provider Options

**Anthropic (Claude)**
```yaml
provider: anthropic
providerOptions:
  anthropic:
    effort: medium      # low | medium | high
```

**OpenAI**
```yaml
provider: openai
providerOptions:
  openai:
    maxToolCalls: 1
    reasoningEffort: high
```

**Google Vertex with Gemini**
```yaml
provider: google-vertex
model: gemini-2.0-flash
providerOptions:
  google:               # Note: 'google', not 'google-vertex'
    useSearchGrounding: true
```

**Google Vertex with Claude**
```yaml
provider: google-vertex
model: claude-sonnet-4-20250514@vertex
providerOptions:
  anthropic:            # Note: 'anthropic', not 'google-vertex'
    effort: medium
```

**Amazon Bedrock**
```yaml
provider: amazon-bedrock
model: anthropic.claude-sonnet-4-20250514-v1:0
maxOutputTokens: 64000        # Recommended: Bedrock has no client-side defaults
providerOptions:
  bedrock:                    # Note: AI SDK 'bedrock' namespace, not 'anthropic'
    guardrailConfig:
      guardrailIdentifier: my-guardrail
      guardrailVersion: "1"
```

**Extended Thinking (any provider)**
```yaml
providerOptions:
  thinking:             # Top-level, not nested
    type: enabled
    budgetTokens: 10000
```

### Why This Structure Exists

AI SDK uses `Record<string, Record<string, JSONValue>>` for `providerOptions` to:
1. **Prevent collisions** - `anthropic.effort` and `openai.reasoningEffort` can coexist
2. **Support multi-provider** - Pass options to multiple providers in one call
3. **Route correctly** - AI SDK extracts each provider's options independently

The nesting is intentional architecture, not redundancy.

### Per-Message Caching (Anthropic Prompt Cache)

Anthropic prompt caching is a **per-message** directive. Mark the block that ends your static prefix and that prefix is cached and reused across calls. Define a `cacheControl` set in frontmatter `messageOptions` and attach it to the block with `options`:

```yaml
messageOptions:
  cached: { anthropic: { cacheControl: { type: ephemeral } } }      # add ttl: 1h for the 1-hour cache
```
```text
<system options="cached">
{{ long static instructions }}
</system>

<user>
{{ per-call input }}
</user>
```

Each set is a provider-namespaced `providerOptions` object (same namespace rules as call-level `providerOptions`); on Vertex with a Claude model use the same `anthropic` namespace. A block may list multiple sets: `options="cached fast"`.

**Rules:**
- Attach the set to the **last static block**, never one containing per-call `{{ variables }}` — a breakpoint on changing content rewrites the cache every call and never hits.
- Order blocks **static-first, dynamic-last**.
- Always give `options` a value, such as `options="cached"`; bare `<system options>` throws at load.
- Put provider settings such as `ttl` inside the named `messageOptions` set. `options` is the only supported role-tag attribute, so `<system ttl="1h">` throws.
- Every name listed in `options` must exist in frontmatter `messageOptions`.
- Minimum cacheable prefix is model-specific (~1,024 tokens for most Sonnet/Opus; higher for some). Below it, caching is silently skipped - verify with `usage.inputTokenDetails.cacheReadTokens` or a normalized cost item with `group: 'input'` and `label: 'cache_read'`.
- Max 4 cache breakpoints per request.

❌ caching a dynamic block: `<user options="cached">{{ topic }}</user>` (never hits)

✅ caching the static prefix: `<system options="cached">{{ guide }}</system>` then `<user>{{ topic }}</user>`

**OpenAI / Azure:** caching is automatic for prompts ≥1024 tokens — no `messageOptions` needed. Tune routing with `providerOptions.openai.promptCacheKey` (and `promptCacheRetention: 24h` on GPT-5.1+).
