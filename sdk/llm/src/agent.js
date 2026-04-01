import { ValidationError } from '@outputai/core';
import { resolveInvocationDir } from '@outputai/core/sdk_utils';
import { ToolLoopAgent as AIToolLoopAgent, stepCountIs } from 'ai';
import { hydratePromptTemplate, loadAiSdkOptionsFromPrompt } from './ai_sdk.js';
import { loadPrompt } from './prompt_loader.js';
import { startTrace, endTraceWithError, traceStreamCallbacks } from './trace_utils.js';
import { wrapInOutputResponse } from './response_utils.js';

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
  _promptDir;
  _modelId;
  _systemSkillsVar;
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

    const { loadedPrompt, allVariables, tools: mergedTools } =
      hydratePromptTemplate( prompt, variables, resolvedPromptDir, skills, tools );

    const { messages, ...constructorOptions } = loadAiSdkOptionsFromPrompt( loadedPrompt );

    super( {
      ...constructorOptions,
      ...( Object.keys( mergedTools ).length > 0 ? { tools: mergedTools } : {} ),
      stopWhen: stopWhen ?? stepCountIs( maxSteps ),
      ...rest
    } );

    this._prompt = prompt;
    this._promptDir = resolvedPromptDir;
    this._modelId = loadedPrompt.config.model;
    this._systemSkillsVar = allVariables._system_skills ?? null;
    this._initialMessages = messages;
    this._store = conversationStore ?? null;
  }

  _renderMessages( variables ) {
    const vars = this._systemSkillsVar ?
      { ...variables, _system_skills: this._systemSkillsVar } :
      variables;
    return loadPrompt( this._prompt, vars, this._promptDir ).messages;
  }

  async _preSendHook( variables, userMessages ) {
    const promptMessages = variables !== undefined ?
      this._renderMessages( variables ) :
      this._initialMessages;
    const priorMessages = this._store ? await this._store.getMessages() : [];
    return [ ...promptMessages, ...priorMessages, ...userMessages ];
  }

  async _postSendHook( userMessages, result ) {
    if ( this._store ) {
      await this._store.addMessages( [ ...userMessages, ...( result.response?.messages ?? [] ) ] );
    }
  }

  async generate( { variables, messages: userMessages = [], ...callOptions } = {} ) {
    const traceId = startTrace( 'Agent.generate', { prompt: this._prompt, variables } );
    try {
      const messages = await this._preSendHook( variables, userMessages );
      const result = await super.generate( { messages, ...callOptions } );
      const wrapped = await wrapInOutputResponse( result, { traceId, modelId: this._modelId } );
      await this._postSendHook( userMessages, wrapped );
      return wrapped;
    } catch ( error ) {
      endTraceWithError( traceId, error );
      throw error;
    }
  }

  async stream( { variables, messages: userMessages = [], onFinish, onError, ...callOptions } = {} ) {
    const traceId = startTrace( 'Agent.stream', { prompt: this._prompt, variables } );
    try {
      const messages = await this._preSendHook( variables, userMessages );
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
