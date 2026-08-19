import { step, z } from '@outputai/core';
import { Agent, aiSdk, generateText, type MessageStore } from '@outputai/llm';
import {
  reviewInputSchema,
  reviewOutputSchema,
  streamReviewOutputSchema,
  streamedReviewOutputSchema
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
    const storedMessages = await store.getMessages();

    return {
      content: result.result,
      streamedContent,
      chunkCount: chunks.length,
      matches: result.result === streamedContent,
      storedMessageCount: storedMessages.length
    };
  }
} );

export const reviewContentStream = step( {
  name: 'reviewContentStream',
  description: 'Review technical content using Agent.stream',
  inputSchema: reviewInputSchema,
  outputSchema: streamReviewOutputSchema,
  fn: async input => {
    const agent = new Agent( {
      prompt: 'writing_assistant@v1',
      variables: input
    } );
    const stream = await agent.stream();
    const chunks: string[] = [];
    for await ( const chunk of stream.textStream ) {
      chunks.push( chunk );
    }

    return {
      content: chunks.join( '' ),
      chunkCount: chunks.length
    };
  }
} );
