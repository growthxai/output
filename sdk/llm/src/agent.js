import { ToolLoopAgent as AIToolLoopAgent } from 'ai';
import { loadAiSdkTextOptions } from './ai_sdk_options.js';
import { wrapTextGeneration, wrapStream } from './utils/wrap.js';
import { Role } from './consts.js';
import { drainStream } from './utils/stream.js';
import { loadPrompt } from './prompt/loader.js';
import { loadSkills } from './utils/skills.js';
import * as Validator from './validations.js';
import { Logger } from '@outputai/core';

export class Agent {
  #agent;
  #prompt;
  #initialMessages;
  #store;

  constructor( args ) {
    const { promptFile, promptObject, promptDir, variables, tools, output, stopWhen, messageStore } = Validator.parseAgentArgs( args );

    const prompt = promptObject ?? loadPrompt( promptFile, variables, promptDir );
    const skills = loadSkills( prompt );

    const { instructions, messages, ...aiOptions } = loadAiSdkTextOptions( { prompt, skills, tools, output, stopWhen } );

    this.#agent = new AIToolLoopAgent( {
      ...aiOptions,
      ...( instructions.length > 0 ? { instructions } : {} )
    } );

    this.#prompt = prompt;
    // `messages` is system-free but may still hold authored <assistant> blocks;
    // seed only <user> turns into each generate()/stream() call.
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

    return wrapTextGeneration( {
      name: 'Agent.generate',
      prompt: this.#prompt,
      fn: async wiringOptions => {
        const response = await this.#agent.generate( {
          messages: combinedMessages,
          allowSystemInMessages: true,
          ...( abortSignal && { abortSignal } ),
          ...( toolChoice && { toolChoice } ),
          ...wiringOptions
        } );
        if ( response.finishReason !== 'error' ) {
          await this.#storeMessages( messages.concat( response.responseMessages ?? [] ) );
        }
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

    return wrapTextGeneration( {
      name: 'Agent.generateWithStreaming',
      prompt: this.#prompt,
      fn: async wiringOptions => {
        const state = { response: null };
        const stream = await this.#agent.stream( {
          messages: combinedMessages,
          allowSystemInMessages: true,
          ...( onChunk && { onChunk } ),
          ...( abortSignal && { abortSignal } ),
          ...( toolChoice && { toolChoice } ),
          ...wiringOptions,
          onEnd: res => {
            state.response = res;
          },
          onError: _ => {} // Suppress AI-SDK console printing
        } );

        await drainStream( stream, abortSignal );

        if ( !state.response ) {
          throw new Error( 'Streaming completed without a response.' );
        }

        state.response.output = await stream.output;
        if ( state.response.finishReason !== 'error' ) {
          await this.#storeMessages( messages.concat( state.response.responseMessages ?? [] ) );
        }

        return state.response;
      }
    } );
  }

  async stream( args ) {
    const { messages, abortSignal, toolChoice, onChunk, onEnd, onError } = Validator.parseAgentStreamArgs( args );
    const combinedMessages = await this.#combineWithPreviousMessages( messages );

    return wrapStream( {
      name: 'Agent.stream',
      prompt: this.#prompt,
      abortSignal,
      fn: ( { onEndHook, onErrorHook, telemetry } ) => this.#agent.stream( {
        messages: combinedMessages,
        allowSystemInMessages: true,
        ...( onChunk && { onChunk } ),
        ...( abortSignal && { abortSignal } ),
        ...( toolChoice && { toolChoice } ),
        telemetry,
        onEnd: response =>
          onEndHook( response, async parsedResponse => {
            if ( response.finishReason !== 'error' ) {
              await this.#storeMessages( messages.concat( response.responseMessages ?? [] ) )
                .catch( error =>
                  Logger.error( 'Message store persistence failed', { namespace: 'LLM', error: error?.message || String( error ) } )
                );
            }
            await onEnd?.( parsedResponse );
          } ),
        onError: event => onErrorHook( event, error => onError?.( { ...event, error } ) )
      } )
    } );
  }
}
