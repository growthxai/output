---
name: prompt-file-provider-options
description: Guide to the providerOptions structure in .prompt files — decision tree for where an option goes, common mistakes, per-provider quick reference, and Anthropic prompt caching. Use when writing or reviewing .prompt file frontmatter (provider, model, providerOptions, messageOptions).
---

## Writing .prompt Files: ProviderOptions Guide

When creating `.prompt` files, understanding the `providerOptions` structure is critical.

### Decision Tree: Where Does This Option Go?

```
Is it a standard AI SDK option (temperature, maxTokens, topP, etc.)?
├─ YES → Top-level config (alongside provider and model)
└─ NO → providerOptions

In providerOptions:
├─ Is it 'thinking' or 'order'? → Top-level (special AI SDK features)
└─ Is it provider-specific? → Nested under provider namespace
```

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

❌ **Mistake 3: Wrong namespace for Vertex Gemini**
```yaml
provider: vertex
model: gemini-2.0-flash
providerOptions:
  vertex:               # WRONG: Gemini uses 'google' namespace
    useSearchGrounding: true
```

✅ **Correct:**
```yaml
provider: vertex
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

**Vertex with Gemini**
```yaml
provider: vertex
model: gemini-2.0-flash
providerOptions:
  google:               # Note: 'google', not 'vertex'
    useSearchGrounding: true
```

**Vertex with Claude**
```yaml
provider: vertex
model: claude-sonnet-4-20250514@vertex
providerOptions:
  anthropic:            # Note: 'anthropic', not 'vertex'
    effort: medium
```

**Amazon Bedrock**
```yaml
provider: bedrock
model: anthropic.claude-sonnet-4-20250514-v1:0
maxTokens: 64000              # Recommended: Bedrock has no client-side defaults
providerOptions:
  bedrock:                    # Note: 'bedrock', not 'anthropic'
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
- Minimum cacheable prefix is model-specific (~1,024 tokens for most Sonnet/Opus; higher for some). Below it, caching is silently skipped — verify via the cost trace (`cachedInputTokens`).
- Max 4 cache breakpoints per request.

❌ caching a dynamic block: `<user options="cached">{{ topic }}</user>` (never hits)

✅ caching the static prefix: `<system options="cached">{{ guide }}</system>` then `<user>{{ topic }}</user>`

**OpenAI / Azure:** caching is automatic for prompts ≥1024 tokens — no `messageOptions` needed. Tune routing with `providerOptions.openai.promptCacheKey` (and `promptCacheRetention: 24h` on GPT-5.1+).
