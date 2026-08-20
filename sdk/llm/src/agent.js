import { ToolLoopAgent as AIToolLoopAgent } from 'ai';
import { loadAiSdkTextOptions } from './ai_sdk_options.js';
import { wrapGeneration, wrapStream } from './utils/wrap.js';
import { Role } from './consts.js';
import { drainStream } from './utils/stream.js';
import { loadPrompt } from './prompt/loader.js';
import { loadSkills } from './utils/skills.js';
import * as Validator from './validations.js';

export class Agent extends AIToolLoopAgent {
  #prompt;
  #initialMessages;
  #store;

  constructor( args ) {
    const { promptFile, promptDir, variables, tools, output, stopWhen, messageStore } = Validator.parseAgentArgs( args );

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
    // `messages` is system-free but may still hold authored <assistant>/<tool>
    // blocks; seed only <user> turns into each generate()/stream() call.
    this.#initialMessages = messages.filter( m => m.role === Role.USER );
    this.#store = messageStore ?? null;
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
    const { messages, abortSignal, toolChoice } = Validator.parseAgentGenerateArgs( args );
    const combinedMessages = await this.#combineWithPreviousMessages( messages );

    return wrapGeneration( {
      name: 'Agent.generate',
      prompt: this.#prompt,
      fn: async () => {
        const response = await super.generate( {
          messages: combinedMessages,
          allowSystemInMessages: true,
          ...( abortSignal && { abortSignal } ),
          ...( toolChoice && { toolChoice } )
        } );
        await this.#storeMessages( messages.concat( response.response?.messages ?? [] ) );
        return response;
      }
    } );
  }

  /**
   * Generates a completed agent response over streaming transport, invoking `onChunk` as parts arrive.
   */
  async generateWithStreaming( args ) {
    const { messages, abortSignal, toolChoice, onChunk } = Validator.parseAgentGenerateWithStreamingArgs( args );
    const combinedMessages = await this.#combineWithPreviousMessages( messages );

    return wrapGeneration( {
      name: 'Agent.generateWithStreaming',
      prompt: this.#prompt,
      fn: async () => {
        const state = { response: null };
        const stream = await super.stream( {
          messages: combinedMessages,
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
        await this.#storeMessages( messages.concat( state.response.response?.messages ?? [] ) );

        return state.response;
      }
    } );
  }

  async stream( args ) {
    const { messages, abortSignal, toolChoice, onChunk, onFinish, onError } = Validator.parseAgentStreamArgs( args );
    const combinedMessages = await this.#combineWithPreviousMessages( messages );

    return wrapStream( {
      name: 'Agent.stream',
      prompt: this.#prompt,
      fn: ( { onFinishHook, onErrorHook } ) => super.stream( {
        messages: combinedMessages,
        allowSystemInMessages: true,
        ...( onChunk && { onChunk } ),
        ...( abortSignal && { abortSignal } ),
        ...( toolChoice && { toolChoice } ),
        onFinish: response =>
          onFinishHook( response, async parsedResponse => {
            if ( response.finishReason !== 'error' ) {
              await this.#storeMessages( messages.concat( response.response?.messages ?? [] ) );
            }
            await onFinish?.( parsedResponse );
          } ),
        onError: event => onErrorHook( event, error => onError?.( { ...event, error } ) )
      } )
    } );
  }
}
