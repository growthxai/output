import { ValidationError } from '@outputai/core';
import { resolveInvocationDir } from '@outputai/core/sdk_utils';
import { ToolLoopAgent as AIToolLoopAgent, stepCountIs } from 'ai';
import { hydratePromptTemplate, loadAiSdkOptionsFromPrompt } from './ai_sdk.js';
import { startTrace, endTraceWithError } from './utils/trace.js';
import { wrapTextResponse, wrapStreamOnFinishResponse } from './utils/response_wrappers.js';
import { ROLE, isRole, getContent } from './utils/message.js';

export { skill } from './skill.js';

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
    prompt, promptDir, variables = {}, skills = [], tools = {},
    stopWhen, maxSteps = 10, conversationStore, ...rest
  } ) {
    if ( !prompt ) {
      throw new ValidationError( 'Agent requires a prompt' );
    }

    // Must be captured synchronously — Temporal async activity execution
    // breaks the call stack, so resolveInvocationDir() fails if called lazily.
    const resolvedPromptDir = promptDir ?? resolveInvocationDir();

    const { loadedPrompt, tools: mergedTools } =
      hydratePromptTemplate( prompt, variables, resolvedPromptDir, skills, tools );

    const { messages: allMessages, ...constructorOptions } = loadAiSdkOptionsFromPrompt( loadedPrompt );

    // Extract system messages as `instructions` for the ToolLoopAgent constructor
    // and keep user messages for generate() calls — avoids provider errors
    // with multiple system messages during multi-step tool loops
    const systemContent = allMessages.filter( isRole( ROLE.SYSTEM ) ).map( getContent ).join( '\n\n' );

    super( {
      ...constructorOptions,
      ...( systemContent ? { instructions: systemContent } : {} ),
      ...( Object.keys( mergedTools ).length > 0 ? { tools: mergedTools } : {} ),
      stopWhen: stopWhen ?? stepCountIs( maxSteps ),
      ...rest
    } );

    this.#prompt = prompt;
    this.#modelId = loadedPrompt.config.model;
    this.#initialMessages = allMessages.filter( isRole( ROLE.USER ) );
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
      const response = await super.generate( { messages, ...callOptions } );
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
        ...callOptions,
        ...wrapStreamOnFinishResponse( { traceId, modelId: this.#modelId, onFinish, onError } )
      } );
    } catch ( error ) {
      endTraceWithError( { traceId, error } );
      throw error;
    }
  }
}
