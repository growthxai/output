import * as AI from 'ai';
import { loadPrompt } from './prompt/loader.js';
import { wrapGeneration, wrapStream } from './utils/wrap.js';
import { loadAiSdkTextOptions, loadAiSdkImageOptions } from './ai_sdk_options.js';
import { drainStream } from './utils/stream.js';
import { loadSkills } from './utils/skills.js';
import * as Validator from './validations.js';

export const generateText = async args => {
  const { promptFile, variables, promptDir, ...aiOptions } = Validator.parseGenerateTextArgs( args );
  const prompt = loadPrompt( promptFile, variables, promptDir );
  const skills = loadSkills( prompt );

  return wrapGeneration( {
    name: 'generateText',
    prompt,
    fn: () => AI.generateText( loadAiSdkTextOptions( { prompt, skills, ...aiOptions } ) )
  } );
};

export const streamText = args => {
  const { promptFile, variables, promptDir, onFinish, onError, onChunk, ...aiOptions } = Validator.parseStreamTextArgs( args );
  const prompt = loadPrompt( promptFile, variables, promptDir );
  const skills = loadSkills( prompt );

  return wrapStream( {
    name: 'streamText',
    prompt,
    fn: ( { onFinishHook, onErrorHook } ) => AI.streamText( {
      ...loadAiSdkTextOptions( { prompt, skills, ...aiOptions } ),
      ...( onChunk && { onChunk } ),
      onFinish: response => onFinishHook( response, onFinish ),
      onError: event => onErrorHook( event, error => onError?.( { ...event, error } ) )
    } )
  } );
};

/**
 * Generates a completed text response over streaming transport, invoking `onChunk` as parts arrive.
 */
export const generateTextWithStreaming = async args => {
  const { promptFile, variables, promptDir, onChunk, ...aiOptions } = Validator.parseGenerateTextWithStreamingArgs( args );
  const prompt = loadPrompt( promptFile, variables, promptDir );
  const skills = loadSkills( prompt );

  return wrapGeneration( {
    name: 'generateTextWithStreaming',
    prompt,
    fn: async () => {
      const state = { response: null };
      const stream = AI.streamText( {
        ...loadAiSdkTextOptions( { prompt, skills, ...aiOptions } ),
        ...( onChunk && { onChunk } ),
        onFinish: res => {
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
  const { promptFile, promptDir, variables, ...aiOptions } = Validator.parseGenerateImageArgs( args );
  const prompt = loadPrompt( promptFile, variables, promptDir );

  return wrapGeneration( {
    name: 'generateImage',
    prompt,
    fn: () => AI.generateImage( loadAiSdkImageOptions( { prompt, ...aiOptions } ) )
  } );
};
