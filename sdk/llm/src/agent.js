import { ValidationError } from '@outputai/core';
import { resolveInvocationDir } from '@outputai/core/sdk_utils';
import { ToolLoopAgent as AIToolLoopAgent, stepCountIs } from 'ai';
import { hydratePromptTemplate, loadAiSdkOptionsFromPrompt } from './ai_sdk.js';
import { startTrace, endTraceWithError, traceStreamCallbacks } from './trace_utils.js';
import { wrapInOutputResponse } from './response_utils.js';
import { ROLE, isRole, getContent } from './message_utils.js';

export { skill } from './skill.js';

export const createMemoryConversationStore = () => {
  const messages = [];
  return {
    getMessages: () => messages,
    addMessages: newMessages => messages.push( ...newMessages )
  };
};

export class Agent extends AIToolLoopAgent {
  _prompt;
  _modelId;
  _initialMessages;
  _store;

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

    this._prompt = prompt;
    this._modelId = loadedPrompt.config.model;
    this._initialMessages = allMessages.filter( isRole( ROLE.USER ) );
    this._store = conversationStore ?? null;
  }

  async _preSendHook( userMessages ) {
    const priorMessages = this._store ? await this._store.getMessages() : [];
    return [ ...this._initialMessages, ...priorMessages, ...userMessages ];
  }

  async _postSendHook( userMessages, result ) {
    if ( this._store ) {
      await this._store.addMessages( [ ...userMessages, ...( result.response?.messages ?? [] ) ] );
    }
  }

  async generate( { messages: userMessages = [], ...callOptions } = {} ) {
    const traceId = startTrace( 'Agent.generate', { prompt: this._prompt } );
    try {
      const messages = await this._preSendHook( userMessages );
      const result = await super.generate( { messages, ...callOptions } );
      const wrapped = await wrapInOutputResponse( result, { traceId, modelId: this._modelId } );
      await this._postSendHook( userMessages, wrapped );
      return wrapped;
    } catch ( error ) {
      endTraceWithError( traceId, error );
      throw error;
    }
  }

  async stream( { messages: userMessages = [], onFinish, onError, ...callOptions } = {} ) {
    const traceId = startTrace( 'Agent.stream', { prompt: this._prompt } );
    try {
      const messages = await this._preSendHook( userMessages );
      return super.stream( {
        messages,
        ...callOptions,
        ...traceStreamCallbacks( traceId, this._modelId, { onFinish, onError } )
      } );
    } catch ( error ) {
      endTraceWithError( traceId, error );
      throw error;
    }
  }
}
