---
"@outputai/llm": patch
---

Bump `@ai-sdk/anthropic` from `3.0.71` to `3.0.78` to expose Anthropic's new server-side `advisor_20260301` tool factory. Prompts can now configure it directly:

```yaml
provider: anthropic
tools:
  advisor_20260301: {}
```

No code changes were required in `@outputai/llm` — `loadTools()` resolves tool factories dynamically off the provider, so the new factory wires up automatically. Advisor support is Anthropic-direct only (not Vertex or Bedrock).
