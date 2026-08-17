import { ValidationError } from '@outputai/core';
import { Path } from '@outputai/core/sdk/helpers';
import { ToolLoopAgent as AIToolLoopAgent, stepCountIs } from 'ai';
import { loadAiSdkTextOptions } from './ai_sdk_options.js';
import { prepareTextPrompt } from './prompt/prepare_text.js';
import { startTrace, endTraceWithError } from './utils/trace.js';
import { wrapTextResponse } from './utils/response_wrappers.js';
import { mapAiError } from './utils/error_handler.js';
import { ROLE, isRole } from './utils/message.js';
export { skill } from './prompt/skill.js';

export const createMemoryConversationStore = () => {
  const messages = [];
  return {
    getMessages: () => messages,
    addMessages: newMessages => messages.push( ...newMessages )
  };
};

export class Agent extends AIToolLoopAgent {
  #prompt;
  #modelId;
  #providerId;
  #initialMessages;
  #store;

  constructor( {
    prompt,
    promptDir,
    variables = {},
    skills = [],
    tools: toolsArg,
    stopWhen,
    maxSteps = 10,
    conversationStore,
    ...rest
  } ) {
    if ( !prompt ) {
      throw new ValidationError( 'Agent requires a prompt' );
    }

    // Must be captured synchronously — Temporal async activity execution
    // breaks the call stack, so Path.resolveInvocationDir() fails if called lazily.
    const resolvedPromptDir = promptDir ?? Path.resolveInvocationDir();

    const { loadedPrompt, tools } = prepareTextPrompt( { prompt, variables, promptDir: resolvedPromptDir, skills, tools: toolsArg } );

    const { system, messages, ...constructorOptions } = loadAiSdkTextOptions( loadedPrompt );

    // loadAiSdkTextOptions routes system blocks to the `system` slot (preserving
    // per-message providerOptions); pass them as the agent's `instructions`.
    super( {
      ...constructorOptions,
      ...( system.length > 0 ? { instructions: system } : {} ),
      ...( tools ? { tools } : {} ),
      stopWhen: stopWhen ?? stepCountIs( maxSteps ),
      ...rest
    } );

    this.#prompt = prompt;
    this.#modelId = loadedPrompt.config.model;
    this.#providerId = loadedPrompt.config.provider;
    // `messages` is system-free but may still hold authored <assistant>/<tool>
    // blocks; seed only <user> turns into each generate()/stream() call.
    this.#initialMessages = messages.filter( isRole( ROLE.USER ) );
    this.#store = conversationStore ?? null;
  }

  async #fetchMessages( userMessages ) {
    const priorMessages = this.#store ? await this.#store.getMessages() : [];
    return [ ...this.#initialMessages, ...priorMessages, ...userMessages ];
  }

  async #storeMessages( userMessages, result ) {
    if ( this.#store ) {
      await this.#store.addMessages( [ ...userMessages, ...( result.response?.messages ?? [] ) ] );
    }
  }

  async generate( { messages: userMessages = [], ...callOptions } = {} ) {
    const traceId = startTrace( { name: 'Agent.generate', prompt: this.#prompt } );
    try {
      const messages = await this.#fetchMessages( userMessages );
      const response = await super.generate( { messages, allowSystemInMessages: true, ...callOptions } );
      const wrapped = await wrapTextResponse( { traceId, response, providerId: this.#providerId, modelId: this.#modelId } );
      await this.#storeMessages( userMessages, wrapped );
      return wrapped;
    } catch ( originalError ) {
      const error = mapAiError( originalError );
      endTraceWithError( { traceId, error } );
      throw error;
    }
  }

  /**
   * Generates a completed agent response over streaming transport, invoking `onChunk` as parts arrive.
   */
  async generateWithStreaming( { messages: userMessages = [], onFinish, onError, ...callOptions } = {} ) {
    const traceId = startTrace( { name: 'Agent.generateWithStreaming', prompt: this.#prompt } );
    const state = {
      response: null
    };

    try {
      const messages = await this.#fetchMessages( userMessages );
      const stream = await super.stream( {
        messages,
        allowSystemInMessages: true,
        ...callOptions,
        onFinish( response ) {
          state.response = response;
        },
        onError( event ) {
          throw event.error;
        }
      } );

      for await ( const part of stream.fullStream ) {
        if ( part.type === 'abort' ) {
          const reason = callOptions.abortSignal?.reason;
          throw reason instanceof Error ?
            reason :
            new Error( part.reason ?? 'Agent streaming generation aborted.', { cause: reason } );
        }
      }

      if ( !state.response ) {
        throw new Error( 'Agent streaming generation completed without a response.' );
      }

      const output = await stream.output;
      const response = await wrapTextResponse( {
        traceId,
        providerId: this.#providerId,
        modelId: this.#modelId,
        response: state.response,
        extraProperties: { output }
      } );
      await this.#storeMessages( userMessages, response );
      await onFinish?.( response );
      return response;
    } catch ( originalError ) {
      const error = mapAiError( originalError );
      endTraceWithError( { traceId, error } );
      try {
        await onError?.( { error } );
      } catch {
        // Preserve the generation error if the observer fails.
      }
      throw error;
    }
  }

  async stream( { messages: userMessages = [], onFinish, onError, ...callOptions } = {} ) {
    const traceId = startTrace( { name: 'Agent.stream', prompt: this.#prompt } );

    try {
      const messages = await this.#fetchMessages( userMessages );
      return await super.stream( {
        messages,
        allowSystemInMessages: true,
        ...callOptions,
        onFinish: async response => {
          const proxiedResponse = await wrapTextResponse( { traceId, providerId: this.#providerId, modelId: this.#modelId, response } );
          return onFinish?.( proxiedResponse );
        },
        onError( event ) {
          const error = mapAiError( event.error );
          endTraceWithError( { traceId, error } );
          return onError?.( { ...event, error } );
        }
      } );
    } catch ( originalError ) {
      const error = mapAiError( originalError );
      endTraceWithError( { traceId, error } );
      throw error;
    }
  }
}
