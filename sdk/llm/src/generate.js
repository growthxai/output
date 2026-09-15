import * as AI from 'ai';
import { loadPrompt } from './prompt/loader.js';
import { wrapImageGeneration, wrapStream, wrapTextGeneration } from './utils/wrap.js';
import { loadAiSdkTextOptions, loadAiSdkImageOptions } from './ai_sdk_options.js';
import { drainStream } from './utils/stream.js';
import { loadSkills } from './utils/skills.js';
import * as Validator from './validations.js';

export const generateText = async args => {
  const { promptFile, promptObject, variables, promptDir, ...aiOptions } = Validator.parseGenerateTextArgs( args );
  const prompt = promptObject ?? loadPrompt( promptFile, variables, promptDir );
  const skills = loadSkills( prompt );

  return wrapTextGeneration( {
    name: 'generateText',
    prompt,
    fn: wiringOptions => AI.generateText( {
      ...loadAiSdkTextOptions( { prompt, skills, ...aiOptions } ),
      ...wiringOptions
    } )
  } );
};

export const streamText = args => {
  const { promptFile, promptObject, variables, promptDir, onEnd, onError, onChunk, ...aiOptions } = Validator.parseStreamTextArgs( args );
  const prompt = promptObject ?? loadPrompt( promptFile, variables, promptDir );
  const skills = loadSkills( prompt );

  return wrapStream( {
    name: 'streamText',
    prompt,
    abortSignal: aiOptions.abortSignal,
    fn: ( { onEndHook, onErrorHook, telemetry } ) => AI.streamText( {
      ...loadAiSdkTextOptions( { prompt, skills, ...aiOptions } ),
      ...( onChunk && { onChunk } ),
      telemetry,
      onEnd: response => onEndHook( response, onEnd ),
      onError: event => onErrorHook( event, error => onError?.( { ...event, error } ) )
    } )
  } );
};

/**
 * Generates a completed text response over streaming transport, invoking `onChunk` as parts arrive.
 */
export const generateTextWithStreaming = async args => {
  const { promptFile, promptObject, variables, promptDir, onChunk, ...aiOptions } = Validator.parseGenerateTextWithStreamingArgs( args );
  const prompt = promptObject ?? loadPrompt( promptFile, variables, promptDir );
  const skills = loadSkills( prompt );

  return wrapTextGeneration( {
    name: 'generateTextWithStreaming',
    prompt,
    fn: async wiringOptions => {
      const state = { response: null };
      const stream = AI.streamText( {
        ...loadAiSdkTextOptions( { prompt, skills, ...aiOptions } ),
        ...( onChunk && { onChunk } ),
        ...wiringOptions,
        onEnd: res => {
          state.response = res;
        },
        onError: _ => {} // Suppress AI-SDK console printing
      } );

      await drainStream( stream, aiOptions.abortSignal );

      if ( !state.response ) {
        throw new Error( 'Streaming generation completed without a response.' );
      }

      state.response.output = await stream.output;
      return state.response;
    }
  } );
};

export const generateImage = async args => {
  const { promptFile, promptObject, promptDir, variables, ...aiOptions } = Validator.parseGenerateImageArgs( args );
  const prompt = promptObject ?? loadPrompt( promptFile, variables, promptDir );

  return wrapImageGeneration( {
    name: 'generateImage',
    prompt,
    fn: () => AI.generateImage( loadAiSdkImageOptions( { prompt, ...aiOptions } ) )
  } );
};
