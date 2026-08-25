import { step, z } from '@outputai/core';
import { Agent, aiSdk, generateText, type MessageStore } from '@outputai/llm';
import {
  reviewInputSchema,
  reviewOutputSchema,
  streamReviewOutputSchema,
  streamedReviewOutputSchema,
  messageStoreReviewOutputSchema
} from './types.js';

const createMemoryMessageStore = (): MessageStore => {
  const messages: Parameters<MessageStore['addMessages']>[0] = [];
  return {
    getMessages: () => messages,
    addMessages: newMessages => {
      messages.push( ...newMessages );
    }
  };
};

const snapshotStore = async ( store: MessageStore ) =>
  ( await store.getMessages() ).map( message => ( {
    role: message.role,
    content: typeof message.content === 'string' ? message.content : JSON.stringify( message.content )
  } ) );

type StoredMessages = Awaited<ReturnType<MessageStore['getMessages']>>;

const countMessageParts = ( messages: StoredMessages, role: string, partType: string ) =>
  messages.reduce( ( count, message ) => {
    if ( message.role !== role || !Array.isArray( message.content ) ) {
      return count;
    }
    return count + message.content.filter(
      part => typeof part === 'object' && part !== null && 'type' in part && part.type === partType
    ).length;
  }, 0 );

export const reviewContent = step( {
  name: 'reviewContent',
  description: 'Review technical content using the Agent class with structured output',
  inputSchema: reviewInputSchema,
  outputSchema: reviewOutputSchema,
  fn: async input => {
    const agent = new Agent( {
      prompt: 'writing_assistant@v1',
      variables: input,
      output: aiSdk.Output.object( { schema: reviewOutputSchema } )
    } );
    const result = await agent.generate();
    return result.output;
  }
} );

export const reviewContentFreeform = step( {
  name: 'reviewContentFreeform',
  description: 'Review technical content using the Agent class with free-form text output',
  inputSchema: reviewInputSchema,
  outputSchema: z.string(),
  fn: async input => {
    const agent = new Agent( {
      prompt: 'writing_assistant@v1',
      variables: input
    } );
    const result = await agent.generate();
    return result.text;
  }
} );

export const reviewContentGenerateText = step( {
  name: 'reviewContentGenerateText',
  description: 'Review technical content using generateText directly',
  inputSchema: reviewInputSchema,
  outputSchema: z.string(),
  fn: async input => {
    const result = await generateText( {
      prompt: 'writing_assistant@v1',
      variables: input
    } );
    return result.text;
  }
} );

export const reviewContentNoSkills = step( {
  name: 'reviewContentNoSkills',
  description: 'Review content using a prompt with skills: [] - confirms no skills are loaded',
  inputSchema: reviewInputSchema,
  outputSchema: z.string(),
  fn: async input => {
    const agent = new Agent( {
      prompt: 'no_skills_assistant@v1',
      variables: input
    } );
    const result = await agent.generate();
    return result.text;
  }
} );

export const reviewContentGenerateWithStreaming = step( {
  name: 'reviewContentGenerateWithStreaming',
  description: 'Review technical content using Agent.generateWithStreaming',
  inputSchema: reviewInputSchema,
  outputSchema: streamedReviewOutputSchema,
  fn: async input => {
    const store = createMemoryMessageStore();
    const chunks: string[] = [];
    const agent = new Agent( {
      prompt: 'writing_assistant@v1',
      variables: input,
      messageStore: store
    } );
    const result = await agent.generateWithStreaming( {
      onChunk( { chunk } ) {
        if ( chunk.type === 'text-delta' ) {
          chunks.push( chunk.text );
        }
      }
    } );
    const streamedContent = chunks.join( '' );
    const storedMessages = await snapshotStore( store );

    return {
      content: result.result,
      streamedContent,
      chunkCount: chunks.length,
      matches: result.result === streamedContent,
      storedMessageCount: storedMessages.length,
      storedMessages
    };
  }
} );

export const reviewContentStream = step( {
  name: 'reviewContentStream',
  description: 'Review technical content using Agent.stream',
  inputSchema: reviewInputSchema,
  outputSchema: streamReviewOutputSchema,
  fn: async input => {
    const store = createMemoryMessageStore();
    const agent = new Agent( {
      prompt: 'writing_assistant@v1',
      variables: input,
      messageStore: store
    } );
    const captured: { error: unknown } = { error: null };
    const stream = await agent.stream( {
      onError( { error } ) {
        captured.error = error;
      }
    } );
    const chunks: string[] = [];
    for await ( const chunk of stream.textStream ) {
      chunks.push( chunk );
    }
    if ( captured.error ) {
      throw captured.error;
    }
    const storedMessages = await snapshotStore( store );

    return {
      content: chunks.join( '' ),
      chunkCount: chunks.length,
      storedMessageCount: storedMessages.length,
      storedMessages
    };
  }
} );

export const reviewContentMessageStore = step( {
  name: 'reviewContentMessageStore',
  description: 'Verifies multi-step Agent messages are persisted exactly once across turns',
  inputSchema: reviewInputSchema,
  outputSchema: messageStoreReviewOutputSchema,
  fn: async input => {
    const store = createMemoryMessageStore();
    const toolName = 'inspect_content';
    const agent = new Agent( {
      prompt: 'no_skills_assistant@v1',
      variables: input,
      messageStore: store,
      tools: {
        [toolName]: aiSdk.tool( {
          description: 'Inspect the supplied content before reviewing it',
          inputSchema: z.object( {} ),
          execute: () => ( { inspected: true } )
        } )
      },
      stopWhen: aiSdk.hasToolCall( toolName )
    } );

    await agent.generate( {
      toolChoice: { type: 'tool', toolName }
    } );
    const firstMessages = [ ...( await store.getMessages() ) ];
    const afterFirst = await snapshotStore( store );

    if (
      countMessageParts( firstMessages, 'assistant', 'tool-call' ) !== 1 ||
      countMessageParts( firstMessages, 'tool', 'tool-result' ) !== 1
    ) {
      throw new Error( 'Expected one persisted tool call and one persisted tool result after the first turn.' );
    }

    await agent.generate( {
      messages: [ { role: 'user', content: 'In one sentence, what content did I ask you to review?' } ],
      toolChoice: 'none'
    } );
    const secondMessages = await store.getMessages();

    if (
      countMessageParts( secondMessages, 'assistant', 'tool-call' ) !== 1 ||
      countMessageParts( secondMessages, 'tool', 'tool-result' ) !== 1
    ) {
      throw new Error( 'Tool-loop messages were duplicated or lost after the second turn.' );
    }

    return {
      afterFirst,
      afterSecond: await snapshotStore( store )
    };
  }
} );
