import { ValidationError } from '@outputai/core';
import { Path } from '@outputai/core/sdk/helpers';
import { ToolLoopAgent as AIToolLoopAgent, stepCountIs } from 'ai';
import { loadAiSdkTextOptions } from './ai_sdk_options.js';
import { prepareTextPrompt } from './prompt/prepare_text.js';
import { startTrace, endTraceWithError } from './utils/trace.js';
import { wrapTextResponse, wrapStreamOnFinishResponse } from './utils/response_wrappers.js';
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
      const wrapped = await wrapTextResponse( { traceId, response, modelId: this.#modelId } );
      await this.#storeMessages( userMessages, wrapped );
      return wrapped;
    } catch ( error ) {
      endTraceWithError( { traceId, error } );
      throw error;
    }
  }

  async stream( { messages: userMessages = [], onFinish, onError, ...callOptions } = {} ) {
    const traceId = startTrace( { name: 'Agent.stream', prompt: this.#prompt } );
    try {
      const messages = await this.#fetchMessages( userMessages );
      return super.stream( {
        messages,
        allowSystemInMessages: true,
        ...callOptions,
        ...wrapStreamOnFinishResponse( { traceId, modelId: this.#modelId, onFinish } ),
        onError( event ) {
          endTraceWithError( { traceId, error: event.error } );
          onError?.( event );
        }
      } );
    } catch ( error ) {
      endTraceWithError( { traceId, error } );
      throw error;
    }
  }
}
