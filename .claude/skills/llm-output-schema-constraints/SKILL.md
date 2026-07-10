---
name: llm-output-schema-constraints
description: Zod schema constraints that Anthropic rejects or silently ignores when sent as structured-output tool definitions via Output.object(). Use when writing or reviewing Zod schemas passed to Output.object(), or debugging structured-output validation errors.
---

## Schema Constraints for LLM Structured Output

When using `Output.object()` with `generateText`, the Zod schema is converted to JSON Schema and sent to the LLM provider as a tool definition. **Anthropic does not support many JSON Schema constraints**, which means certain Zod methods will cause errors or be silently ignored when the schema is sent to the provider.

### Unsupported constraints in LLM output schemas

**Numbers**: `.min()`, `.max()` on `z.number()` produce `minimum`/`maximum` — rejected by Anthropic.

**Arrays**: `.min()`, `.max()`, `.length()` on `z.array()` produce `minItems`/`maxItems` — Anthropic only supports `minItems` of `0` or `1`. Any other value (e.g. `.length(3)`, `.min(2)`) will be rejected.

### Rule: Use `.describe()` instead of numeric/array constraints for LLM output schemas

```typescript
// LLM output schema - sent to provider via Output.object()
output: Output.object( {
  schema: z.object( {
    score: z.number().describe( 'Quality score 0-100' ),
    predictions: z.array( predictionSchema ).describe( 'Exactly 3 predictions' )
  } )
} )
```

```typescript
// Workflow/evaluator validation schema - Zod-only, NOT sent to LLM
export const workflowOutputSchema = z.object( {
  score: z.number().min( 0 ).max( 100 ).describe( 'Quality score 0-100' ),
  predictions: z.array( predictionSchema ).length( 3 ).describe( 'Exactly 3 predictions' )
} );
```

### When to use which

| Context | `.min()/.max()/.length()` | `.describe()` |
|---------|:-:|:-:|
| Schema passed to `Output.object()` | No (numbers or arrays) | Yes |
| `inputSchema` / `outputSchema` on workflows | OK | Optional |
| `outputSchema` on evaluators | OK | Optional |
| `workflowOutputSchema` in types.ts | OK | Optional |

The `.describe()` annotation guides the LLM on expected ranges and counts. The `.min()/.max()/.length()` constraints are for runtime Zod validation only and should be used on schemas that validate data within your application, not schemas sent to LLM providers.
