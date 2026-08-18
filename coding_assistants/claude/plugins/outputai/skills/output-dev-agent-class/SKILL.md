---
name: output-dev-agent-class
description: Use the Agent class for multi-step tool loops, conversation history, streaming progress, and reusable LLM agents. Use when building agents with skills, structured output, stateful conversations, or streaming callbacks.
allowed-tools: [Read, Write, Edit]
---

# Using the Agent Class

## Overview

The `Agent` class extends AI SDK's `ToolLoopAgent` with Output prompt files and the skills system. Use it when you need multi-step tool execution, conversation history, or a reusable agent instance. For single-shot LLM calls without tools, `generateText` is simpler.

## When to Use This Skill

- Building multi-step agents that call tools in a loop
- Using skills (lazy-loaded instructions) with an agent
- Creating agents with structured output via `aiSdk.Output.object()`
- Implementing stateful conversations with `conversationStore`
- Streaming Agent progress with `onChunk`
- Deciding between `Agent` and `generateText`

## Import Pattern

```typescript
import { Agent, createMemoryConversationStore, aiSdk } from '@outputai/llm';
import { z } from '@outputai/core';
```

`Agent`, `createMemoryConversationStore`, and `Output` all come from `@outputai/llm`. Import `z` from `@outputai/core` (never from `zod` directly).

## Construction

The prompt file is loaded and rendered at construction time. Variables and tools are fixed at construction. Skills and `maxSteps` come from the prompt file. The agent is ready to call `generate()`, `generateWithStreaming()`, or `stream()` immediately.

```typescript
const agent = new Agent( {
  prompt: 'writing_assistant@v1',
  variables: {
    content_type: input.contentType,
    focus: input.focus,
    content: input.content
  },
  output: aiSdk.Output.object( { schema: reviewSchema } )
} );
```

### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `prompt` | `string` | *(required)* | Prompt file name (e.g. `'writing_assistant@v1'`) |
| `variables` | `Record<string, unknown>` | `{}` | Template variables rendered at construction |
| `tools` | `ToolSet` | `{}` | AI SDK tools available during the loop |
| `stopWhen` | `StopCondition` | - | Custom stop condition (overrides prompt `maxSteps`) |
| `output` | `Output` | - | Structured output spec (e.g. `aiSdk.Output.object({ schema })`) |
| `conversationStore` | `ConversationStore` | - | Pluggable store for multi-turn history |
| `temperature` | `number` | - | Override prompt file temperature |
| `onStepFinish` | `Function` | - | Callback after each tool-loop step |
| `prepareStep` | `Function` | - | Customize each step before execution |

## generate()

Run the agent and return when complete:

```typescript
const result = await agent.generate();
console.log( result.text );   // Generated text
console.log( result.output ); // Structured output (when using aiSdk.Output.object)
console.log( result.usage );  // Token counts
```

The result has the same shape as `generateText`: `text`, `result` (alias for `text`), `output`, `usage`, `finishReason`, `toolCalls`, etc.

### Passing Additional Messages

Extend the conversation with extra messages:

```typescript
const result = await agent.generate( {
  messages: [ { role: 'user', content: 'Focus on the introduction section.' } ]
} );
```

Messages are appended after the initial prompt messages (and any conversation store history).

## generateWithStreaming()

Use `generateWithStreaming()` when you need progress callbacks and a complete result:

```typescript
const result = await agent.generateWithStreaming( {
  onChunk( { chunk } ) {
    if ( chunk.type === 'text-delta' ) {
      process.stdout.write( chunk.text );
    }
  }
} );
```

The method behaves like `generate()` while using streaming internally. It returns the complete response, rejects on stream errors, and automatically appends messages to the configured conversation store. Prefer it over `stream()` in Temporal activity steps unless direct access to the stream result is required.

## stream()

Use `stream()` when direct control over `textStream` or `fullStream` is required:

```typescript
const stream = await agent.stream();

for await ( const chunk of stream.textStream ) {
  process.stdout.write( chunk );
}
```

Like `streamText`, the stream result provides `textStream` and `fullStream` iterables, plus promise-based properties (`text`, `usage`, `finishReason`) that resolve on completion.

**Important**: `stream()` does not automatically append messages to the conversation store. If you use direct streaming with a conversation store, persist messages manually in `onFinish`. See `output-dev-llm-streaming` for the complete streaming and error-handling guidance.

## Structured Output

Use `aiSdk.Output.object()` to get typed responses:

```typescript
const reviewSchema = z.object( {
  issues: z.array( z.string() ).describe( 'List of issues found' ),
  suggestions: z.array( z.string() ).describe( 'Actionable suggestions' ),
  score: z.number().describe( 'Quality score 0-100' ),
  summary: z.string().describe( 'Brief overall assessment' )
} );

const agent = new Agent( {
  prompt: 'writing_assistant@v1',
  variables: { content_type: 'documentation', focus: 'clarity', content: markdownContent },
  output: aiSdk.Output.object( { schema: reviewSchema } )
} );

const { output } = await agent.generate();
// output: { issues: string[], suggestions: string[], score: number, summary: string }
```

Use `.describe()` on schema fields instead of `.min()/.max()` for number constraints. Anthropic does not support `minimum`/`maximum` JSON Schema constraints in tool definitions.

## Conversation Store

By default, Agent is stateless. Each `generate()` call starts fresh with only the initial prompt messages. Pass a `conversationStore` to maintain history across calls:

```typescript
import { Agent, createMemoryConversationStore } from '@outputai/llm';

const store = createMemoryConversationStore();
const chatbot = new Agent( {
  prompt: 'chatbot@v1',
  conversationStore: store
} );

const r1 = await chatbot.generate( {
  messages: [ { role: 'user', content: 'Hello, tell me about Output.' } ]
} );
// r1.text: "Output is an AI framework for..."

const r2 = await chatbot.generate( {
  messages: [ { role: 'user', content: 'How does it handle retries?' } ]
} );
// r2 sees the full conversation history from r1
```

### Custom Store

For production use, implement the `ConversationStore` interface with your database:

```typescript
interface ConversationStore {
  getMessages(): ModelMessage[] | Promise<ModelMessage[]>;
  addMessages(messages: ModelMessage[]): void | Promise<void>;
}
```

`createMemoryConversationStore()` is the built-in in-memory implementation.

## Using Agent in Workflow Steps

In workflow steps, construct a new Agent per invocation. Variables come from the step input:

```typescript
import { step, z } from '@outputai/core';
import { Agent, aiSdk } from '@outputai/llm';

const reviewSchema = z.object( {
  summary: z.string().describe( 'Brief assessment' ),
  issues: z.array( z.string() ).describe( 'Problems found' ),
  suggestions: z.array( z.string() ).describe( 'Improvements' ),
  score: z.number().describe( 'Quality score 0-100' )
} );

export const reviewContent = step( {
  name: 'reviewContent',
  description: 'Review technical content using Agent with structured output',
  inputSchema: z.object( {
    content: z.string().describe( 'The content to review' ),
    content_type: z.string().describe( 'Type of content' ),
    focus: z.string().describe( 'Review focus areas' )
  } ),
  outputSchema: reviewSchema,
  fn: async input => {
    const agent = new Agent( {
      prompt: 'writing_assistant@v1',
      variables: input,
      output: aiSdk.Output.object( { schema: reviewSchema } )
    } );
    const { output } = await agent.generate();
    return output;
  }
} );
```

This is the standard pattern. Each step invocation is independent, and Agent construction is cheap.

## Using Agent with Skills

List skill paths in the prompt frontmatter. Do not pass `skills` to `Agent` and do not import `skill()`. See `output-dev-skill-file` for the full skills guide.

## When to Use Agent vs generateText

| | `generateText` | `Agent` |
|---|---|---|
| **Best for** | Single-shot LLM calls | Multi-step tool loops |
| **Tools** | Supported | Supported |
| **Skills** | Supported | Supported |
| **Conversation history** | Manual | Built-in with `conversationStore` |
| **Reusable instance** | No (function call) | Yes (construct once, call many) |
| **Structured output** | `aiSdk.Output.object()` | `aiSdk.Output.object()` |

Start with `generateText`. Move to `Agent` when you need conversation state or a reusable instance with a fixed configuration.

### generateText Example (for comparison)

```typescript
import { generateText } from '@outputai/llm';

const { result } = await generateText( {
  prompt: 'generate_summary@v1',
  variables: {
    company_name: input.name,
    website_content: input.websiteContent
  }
} );
```

## Verification Checklist

- [ ] Import `Agent` from `@outputai/llm` (not from `ai` directly)
- [ ] Import `z` from `@outputai/core` (never from `zod`)
- [ ] Prompt file exists in `prompts/` folder
- [ ] Variables match `{{ variable }}` placeholders in the prompt
- [ ] Prompt frontmatter sets `maxSteps` when skills or tools need a ceiling other than 10
- [ ] `aiSdk.Output.object({ schema })` uses `.describe()` not `.min()/.max()` on numbers
- [ ] Conversation store is only used when multi-turn history is needed
- [ ] Agent is constructed inside the step `fn` (not at module level) for workflow steps
- [ ] Prefer `generateWithStreaming()` when callbacks are sufficient

## Related Skills

- `output-dev-skill-file` - Creating skill files for agents
- `output-dev-llm-streaming` - Streaming progress and Temporal-safe error handling
- `output-dev-prompt-file` - Creating .prompt files used by agents
- `output-dev-step-function` - Using agents in step functions
- `output-dev-types-file` - Defining Zod schemas for structured output
- `output-dev-workflow-function` - Orchestrating agent-powered steps
