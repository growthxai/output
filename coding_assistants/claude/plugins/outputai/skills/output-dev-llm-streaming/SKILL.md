---
name: output-dev-llm-streaming
description: Implement LLM text streaming in Output workflow steps with generateTextWithStreaming, Agent.generateWithStreaming, streamText, or Agent.stream. Use when adding token progress, onChunk callbacks, or handling streamText onFinish/onError with Temporal retries.
allowed-tools: [Read, Write, Edit]
---

# LLM Text Streaming

## When to Use This Skill

- Adding token or chunk progress to an LLM-powered step
- Choosing between completed generation and direct stream access
- Using `onChunk`, or `onFinish` / `onError` on `streamText()` / `Agent.stream()`
- Making stream failures trigger Temporal activity retries
- Streaming Agent responses or persisting streamed conversations

## Choose the API

| Need | Use |
|------|-----|
| Complete single-shot result | `generateText()` |
| Complete result plus `onChunk` progress | `generateTextWithStreaming()` |
| Direct access to `textStream` or `fullStream` | `streamText()` |
| Complete Agent result plus `onChunk` progress | `Agent.generateWithStreaming()` |
| Direct access to the Agent stream | `Agent.stream()` |

In workflow steps, prefer `generateTextWithStreaming()` or `Agent.generateWithStreaming()` when `onChunk` progress is sufficient. They consume the stream internally, return complete results like `generateText()` or `Agent.generate()`, and reject on provider, transport, or abort errors. Rejection allows Temporal to record the failed activity attempt and apply the step retry policy.

`streamText()` and `Agent.stream()` remain supported for code that needs direct control over stream consumption.

`streamText()` returns synchronously, so dynamic skill resolvers passed to it must also resolve synchronously. Use `generateTextWithStreaming()` when skills need asynchronous resolution.

## generateTextWithStreaming()

```typescript
import { generateTextWithStreaming } from '@outputai/llm';

const result = await generateTextWithStreaming( {
  prompt: 'draft@v1',
  variables: { topic },
  onChunk( { chunk } ) {
    if ( chunk.type === 'text-delta' ) {
      process.stdout.write( chunk.text );
    }
  }
} );

return result.result;
```

The result has the same complete response fields as `generateText()`, including `result`, `text`, `output`, `usage`, `finishReason`, and `cost`. Structured output passed with `Output.*` is available through `result.output`.

## Agent.generateWithStreaming()

```typescript
const result = await agent.generateWithStreaming( {
  onChunk( { chunk } ) {
    if ( chunk.type === 'text-delta' ) {
      process.stdout.write( chunk.text );
    }
  }
} );
```

`generateWithStreaming()` returns a complete Agent response and automatically stores messages when the Agent has a `conversationStore`.

## Direct stream error handling

AI SDK streaming delivers provider and transport failures through `onError`. Iterating `textStream` does not reliably throw the original error. When using `streamText()` in a workflow step, capture the error and throw it after consumption:

```typescript
import { streamText } from '@outputai/llm';

const captured: { error: unknown } = { error: null };
const result = streamText( {
  prompt: 'draft@v1',
  variables: { topic },
  onError( { error } ) {
    captured.error = error;
  }
} );

const chunks: string[] = [];
for await ( const chunk of result.textStream ) {
  chunks.push( chunk );
}

if ( captured.error ) {
  throw captured.error;
}

return chunks.join( '' );
```

Registering `onError` without throwing the captured error can let the step return an empty successful result, preventing Temporal from retrying it. Awaiting a completion property may also produce a generic no-output error instead of the original provider error.

`Agent.stream()` does not automatically store conversation messages. Use `Agent.generateWithStreaming()` when a complete stored response meets the requirement.

## Rules

- Prefer the completed streaming APIs in Temporal steps unless direct stream access is required.
- Do not rely on `onError` alone to fail a step using `streamText()`.
- Throw the captured error only after stream consumption finishes.
- Keep `onChunk` side effects bounded. A Temporal signal per token creates a history event per signal, so batch high-frequency updates.
- Do not describe `streamText()` or `Agent.stream()` as deprecated.

## Related Skills

- `output-dev-step-function` - Put LLM calls inside Temporal activity steps
- `output-dev-agent-class` - Construct and use reusable Agents
- `output-dev-prompt-file` - Create prompt files for generation
- `output-error-try-catch` - Handle step and workflow failures
