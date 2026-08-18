import { ToolLoopAgent as AIToolLoopAgent, stepCountIs } from 'ai';
import { loadAiSdkTextOptions } from './ai_sdk_options.js';
import { startTrace, endTraceWithError } from './utils/trace.js';
import { wrapTextResponse } from './utils/response_wrappers.js';
import { mapAiError } from './utils/error_handler.js';
import { ROLE, isRole } from './utils/message.js';
import { drainStream } from './utils/stream.js';
import { loadPrompt } from './prompt/loader.js';
import { loadSkills } from './utils/skills.js';
import { validateAgentArgs } from './validations.js';

export const createMemoryConversationStore = () => {
  const messages = [];
  return {
    getMessages: () => messages,
    addMessages: newMessages => messages.push( ...newMessages )
  };
};

export class Agent extends AIToolLoopAgent {
  #prompt;
  #initialMessages;
  #store;

  constructor( {
    prompt,
    promptDir,
    variables = {},
    tools: toolsArg,
    stopWhen,
    maxSteps = 10,
    conversationStore,
    skills,
    ...rest
  } ) {
    validateAgentArgs( { prompt, promptDir, variables, maxSteps, tools: toolsArg, skills } );

    const loadedPrompt = loadPrompt( prompt, variables, promptDir );
    const loadedSkills = loadSkills( loadedPrompt );

    const { system, messages, ...constructorOptions } = loadAiSdkTextOptions( {
      prompt: loadedPrompt,
      skills: loadedSkills,
      tools: toolsArg,
      maxSteps
    } );

    // loadAiSdkTextOptions routes system blocks to the `system` slot (preserving
    // per-message providerOptions); pass them as the agent's `instructions`.
    super( {
      ...constructorOptions,
      ...( system.length > 0 ? { instructions: system } : {} ),
      stopWhen: stopWhen ?? stepCountIs( maxSteps ),
      ...rest
    } );

    this.#prompt = loadedPrompt;
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
    const traceId = startTrace( { name: 'Agent.generate', prompt: this.#prompt.name } );
    const { provider: providerId, model: modelId } = this.#prompt.config;

    try {
      const messages = await this.#fetchMessages( userMessages );
      const response = await super.generate( { messages, allowSystemInMessages: true, ...callOptions } );
      const wrapped = await wrapTextResponse( { traceId, response, providerId, modelId } );
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
  async generateWithStreaming( { messages: userMessages = [], ...options } = {} ) {
    const traceId = startTrace( { name: 'Agent.generateWithStreaming', prompt: this.#prompt.name } );
    const { provider: providerId, model: modelId } = this.#prompt.config;
    const state = { response: null };

    try {
      const messages = await this.#fetchMessages( userMessages );
      const stream = await super.stream( {
        messages,
        allowSystemInMessages: true,
        ...options,
        onFinish( response ) {
          state.response = response;
        },
        onError: _ => {} // Suppress AI-SDK console printing
      } );

      await drainStream( stream, options?.abortSignal );

      if ( !state.response ) {
        throw new Error( 'Agent streaming generation completed without a response.' );
      }

      state.response.output = await stream.output;
      const wrappedResponse = await wrapTextResponse( { traceId, providerId, modelId, response: state.response } );
      await this.#storeMessages( userMessages, wrappedResponse );

      return wrappedResponse;

    } catch ( originalError ) {
      const error = mapAiError( originalError );
      endTraceWithError( { traceId, error } );
      throw error;
    }

  }

  async stream( { messages: userMessages = [], onFinish, onError, ...callOptions } = {} ) {
    const traceId = startTrace( { name: 'Agent.stream', prompt: this.#prompt.name } );
    const { provider: providerId, model: modelId } = this.#prompt.config;

    try {
      const messages = await this.#fetchMessages( userMessages );
      return await super.stream( {
        messages,
        allowSystemInMessages: true,
        ...callOptions,
        onFinish: async response => {
          const proxiedResponse = await wrapTextResponse( { traceId, providerId, modelId, response } );
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
