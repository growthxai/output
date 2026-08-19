import { ToolLoopAgent as AIToolLoopAgent } from 'ai';
import { loadAiSdkTextOptions } from './ai_sdk_options.js';
import { startTrace, endTraceWithError } from './utils/trace.js';
import { wrapTextResponse } from './utils/response_wrappers.js';
import { mapAiError } from './utils/error_handler.js';
import { Role, isRole } from './utils/message.js';
import { drainStream } from './utils/stream.js';
import { loadPrompt } from './prompt/loader.js';
import { loadSkills } from './utils/skills.js';
import { parseAgentArgs, parseAgentGenerateArgs, parseAgentGenerateWithStreamingArgs, parseAgentStreamArgs } from './validations.js';

export const createMemoryConversationStore = () => {
  const messages = [];
  return {
    getMessages: () => messages,
    addMessages: newMessages => messages.push( ...newMessages )
  };
};

export class Agent extends AIToolLoopAgent {
  #prompt;
  #traceFields;
  #initialMessages;
  #store;

  constructor( args ) {
    const { promptFile, promptDir, variables, tools, output, stopWhen, conversationStore } = parseAgentArgs( args );

    const prompt = loadPrompt( promptFile, variables, promptDir );
    const skills = loadSkills( prompt );

    const { system, messages, ...aiOptions } = loadAiSdkTextOptions( { prompt, skills, tools, output, stopWhen } );

    // loadAiSdkTextOptions routes system blocks to the `system` slot (preserving
    // per-message providerOptions); pass them as the agent's `instructions`.
    super( {
      ...aiOptions,
      ...( system.length > 0 ? { instructions: system } : {} )
    } );

    this.#prompt = prompt;
    this.#traceFields = { promptFile, prompt, variables };
    // `messages` is system-free but may still hold authored <assistant>/<tool>
    // blocks; seed only <user> turns into each generate()/stream() call.
    this.#initialMessages = messages.filter( isRole( Role.USER ) );
    this.#store = conversationStore ?? null;
  }

  async #combineWithPreviousMessages( messages ) {
    return [ ...this.#initialMessages, ...( await this.#store?.getMessages() ?? [] ), ...messages ];
  }

  async #storeMessages( messages ) {
    if ( this.#store ) {
      await this.#store.addMessages( messages );
    }
  }

  async generate( args ) {
    const { messages, abortSignal, toolChoice } = parseAgentGenerateArgs( args );
    const traceId = startTrace( { name: 'Agent.generate', ...this.#traceFields } );
    const { provider: providerId, model: modelId } = this.#prompt.config;

    try {
      const response = await super.generate( {
        messages: await this.#combineWithPreviousMessages( messages ),
        allowSystemInMessages: true,
        ...( abortSignal && { abortSignal } ),
        ...( toolChoice && { toolChoice } )
      } );
      await this.#storeMessages( messages.concat( response.responseMessages ?? [] ) );
      return await wrapTextResponse( { traceId, response, providerId, modelId } );
    } catch ( originalError ) {
      const error = mapAiError( originalError );
      endTraceWithError( { traceId, error } );
      throw error;
    }
  }

  /**
   * Generates a completed agent response over streaming transport, invoking `onChunk` as parts arrive.
   */
  async generateWithStreaming( args ) {
    const { messages, abortSignal, toolChoice, onChunk } = parseAgentGenerateWithStreamingArgs( args );
    const traceId = startTrace( { name: 'Agent.generateWithStreaming', ...this.#traceFields } );
    const { provider: providerId, model: modelId } = this.#prompt.config;
    const state = { response: null };

    try {
      const stream = await super.stream( {
        messages: await this.#combineWithPreviousMessages( messages ),
        allowSystemInMessages: true,
        ...( onChunk && { onChunk } ),
        ...( abortSignal && { abortSignal } ),
        ...( toolChoice && { toolChoice } ),
        onFinish: res => {
          state.response = res;
        },
        onError: _ => {} // Suppress AI-SDK console printing
      } );

      await drainStream( stream, abortSignal );

      if ( !state.response ) {
        throw new Error( 'Agent streaming generation completed without a response.' );
      }

      state.response.output = await stream.output;
      await this.#storeMessages( messages.concat( state.response.responseMessages ?? [] ) );

      return await wrapTextResponse( { traceId, providerId, modelId, response: state.response } );
    } catch ( originalError ) {
      const error = mapAiError( originalError );
      endTraceWithError( { traceId, error } );
      throw error;
    }
  }

  async stream( args ) {
    const { messages, abortSignal, toolChoice, onChunk, onFinish, onError } = parseAgentStreamArgs( args );
    const traceId = startTrace( { name: 'Agent.stream', ...this.#traceFields } );
    const { provider: providerId, model: modelId } = this.#prompt.config;

    try {
      return await super.stream( {
        messages: await this.#combineWithPreviousMessages( messages ),
        allowSystemInMessages: true,
        ...( onChunk && { onChunk } ),
        ...( abortSignal && { abortSignal } ),
        ...( toolChoice && { toolChoice } ),
        onFinish: async response => {
          if ( response.finishReason !== 'error' ) {
            await this.#storeMessages( messages.concat( response.responseMessages ?? [] ) );
          }
          return onFinish?.( await wrapTextResponse( { traceId, providerId, modelId, response } ) );
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
