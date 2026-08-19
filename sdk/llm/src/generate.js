import * as AI from 'ai';
import { loadPrompt } from './prompt/loader.js';
import { startTrace, endTraceWithError } from './utils/trace.js';
import { wrapTextResponse, wrapImageResponse } from './utils/response_wrappers.js';
import { loadAiSdkTextOptions, loadAiSdkImageOptions } from './ai_sdk_options.js';
import { mapAiError } from './utils/error_handler.js';
import { drainStream } from './utils/stream.js';
import { loadSkills } from './utils/skills.js';
import { parseGenerateTextArgs, parseGenerateTextWithStreamingArgs, parseStreamTextArgs, parseGenerateImageArgs } from './validations.js';

export const generateText = async args => {
  const { promptFile, variables, promptDir, ...aiOptions } = parseGenerateTextArgs( args );

  const prompt = loadPrompt( promptFile, variables, promptDir );
  const skills = loadSkills( prompt );

  const traceId = startTrace( { name: 'generateText', promptFile, variables, prompt } );
  const { model: modelId, provider: providerId } = prompt.config;

  try {
    const response = await AI.generateText( loadAiSdkTextOptions( { prompt, skills, ...aiOptions } ) );
    return wrapTextResponse( { traceId, providerId, modelId, response } );
  } catch ( originalError ) {
    const error = mapAiError( originalError );
    endTraceWithError( { traceId, error } );
    throw error;
  }
};

export const streamText = args => {
  const { promptFile, variables, promptDir, onFinish, onError, onChunk, ...aiOptions } = parseStreamTextArgs( args );

  const prompt = loadPrompt( promptFile, variables, promptDir );
  const skills = loadSkills( prompt );

  const traceId = startTrace( { name: 'streamText', promptFile, variables, prompt } );
  const { model: modelId, provider: providerId } = prompt.config;

  try {
    return AI.streamText( {
      ...loadAiSdkTextOptions( { prompt, skills, ...aiOptions } ),
      ...( onChunk && { onChunk } ),
      async onFinish( response ) {
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
};

/**
 * Generates a completed text response over streaming transport, invoking `onChunk` as parts arrive.
 */
export const generateTextWithStreaming = async args => {
  const { promptFile, variables, promptDir, onChunk, ...aiOptions } = parseGenerateTextWithStreamingArgs( args );

  const prompt = loadPrompt( promptFile, variables, promptDir );
  const skills = loadSkills( prompt );

  const traceId = startTrace( { name: 'generateTextWithStreaming', promptFile, variables, prompt } );

  const { model: modelId, provider: providerId } = prompt.config;
  const state = { response: null };

  try {
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
    return await wrapTextResponse( { traceId, providerId, modelId, response: state.response } );
  } catch ( originalError ) {
    const error = mapAiError( originalError );
    endTraceWithError( { traceId, error } );
    throw error;
  }
};

export const generateImage = async args => {
  const { promptFile, promptDir, variables, ...aiOptions } = parseGenerateImageArgs( args );

  const prompt = loadPrompt( promptFile, variables, promptDir );
  const traceId = startTrace( { name: 'generateImage', promptFile, variables, prompt } );
  const { model: modelId, provider: providerId } = prompt.config;

  try {
    const response = await AI.generateImage( loadAiSdkImageOptions( { prompt, ...aiOptions } ) );
    return await wrapImageResponse( { traceId, providerId, modelId, response } );
  } catch ( originalError ) {
    const error = mapAiError( originalError );
    endTraceWithError( { traceId, error } );
    throw error;
  }
};
