import * as AI from 'ai';
import {
  validateGenerateTextArgs,
  validateGenerateTextWithStreamingArgs,
  validateStreamTextArgs,
  validateGenerateImageArgs
} from './validations.js';
import { loadPrompt } from './prompt/loader.js';
import { startTrace, endTraceWithError } from './utils/trace.js';
import { wrapTextResponse, wrapImageResponse } from './utils/response_wrappers.js';
import { loadAiSdkTextOptions, loadAiSdkImageOptions } from './ai_sdk_options.js';
import { mapAiError } from './utils/error_handler.js';
import { drainStream } from './utils/stream.js';
import { loadSkills } from './utils/skills.js';

const defaultAiSdkOptions = {
  allowSystemInMessages: true,
  maxRetries: 0
};

export async function generateText( { prompt: promptFile, variables, promptDir, tools, ...rest } ) {
  const { maxSteps: maxStepsArg, skills: skillsArg, ...aiSdkOptions } = rest;
  validateGenerateTextArgs( { prompt: promptFile, variables, promptDir, tools, skills: skillsArg, maxSteps: maxStepsArg } );

  const prompt = loadPrompt( promptFile, variables, promptDir );
  const skills = loadSkills( prompt );

  const traceId = startTrace( { name: 'generateText', promptFile, variables, prompt } );
  const { model: modelId, provider: providerId } = prompt.config;

  try {
    const response = await AI.generateText( {
      ...loadAiSdkTextOptions( { prompt, skills, tools } ),
      ...defaultAiSdkOptions,
      ...aiSdkOptions
    } );
    return wrapTextResponse( { traceId, providerId, modelId, response } );
  } catch ( originalError ) {
    const error = mapAiError( originalError );
    endTraceWithError( { traceId, error } );
    throw error;
  }
}

export function streamText( { prompt: promptFile, variables, promptDir, onFinish, onError, tools, ...rest } ) {
  const { maxSteps: maxStepsArg, skills: skillsArg, ...aiSdkOptions } = rest;
  validateStreamTextArgs( { prompt: promptFile, variables, promptDir, onFinish, onError, tools, maxSteps: maxStepsArg, skills: skillsArg } );

  const prompt = loadPrompt( promptFile, variables, promptDir );
  const skills = loadSkills( prompt );

  const traceId = startTrace( { name: 'streamText', promptFile, variables, prompt } );
  const { model: modelId, provider: providerId } = prompt.config;

  try {
    return AI.streamText( {
      ...loadAiSdkTextOptions( { prompt, skills, tools } ),
      ...defaultAiSdkOptions,
      ...aiSdkOptions,
      async onFinish( response ) {
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

/**
 * Generates a completed text response over streaming transport, invoking `onChunk` as parts arrive.
 */
export async function generateTextWithStreaming( { prompt: promptFile, variables, promptDir, tools, ...rest } ) {
  const { maxSteps: maxStepsArg, skills: skillsArg, ...aiSdkOptions } = rest;
  validateGenerateTextWithStreamingArgs( { prompt: promptFile, variables, promptDir, tools, maxSteps: maxStepsArg, skills: skillsArg } );

  const prompt = loadPrompt( promptFile, variables, promptDir );
  const skills = loadSkills( prompt );

  const traceId = startTrace( { name: 'generateTextWithStreaming', promptFile, variables, prompt } );

  const { model: modelId, provider: providerId } = prompt.config;
  const state = { response: null };

  try {
    const stream = AI.streamText( {
      ...loadAiSdkTextOptions( { prompt, skills, tools } ),
      ...defaultAiSdkOptions,
      ...aiSdkOptions,
      onFinish( response ) {
        state.response = response;
      },
      onError: _ => {} // Suppress AI-SDK console printing
    } );

    await drainStream( stream, rest?.abortSignal );

    if ( !state.response ) {
      throw new Error( 'Streaming generation completed without a response.' );
    }

    state.response.output = await stream.output;
    return await wrapTextResponse( { traceId, providerId, modelId, response: state.response } );
  } catch ( error ) {
    const mappedError = mapAiError( error );
    endTraceWithError( { traceId, error: mappedError } );
    throw mappedError;
  }
}

export async function generateImage( { prompt: promptFile, variables, promptDir, images, mask, ...rest } ) {
  validateGenerateImageArgs( { prompt: promptFile, variables, promptDir, images, mask } );

  const prompt = loadPrompt( promptFile, variables, promptDir );
  const traceId = startTrace( { name: 'generateImage', promptFile, variables, prompt } );
  const { model: modelId, provider: providerId } = prompt.config;

  try {
    const response = await AI.generateImage( {
      ...loadAiSdkImageOptions( { prompt, images, mask } ),
      maxRetries: defaultAiSdkOptions.maxRetries,
      ...rest
    } );
    return wrapImageResponse( { traceId, providerId, modelId, response } );
  } catch ( originalError ) {
    const error = mapAiError( originalError );
    endTraceWithError( { traceId, error } );
    throw error;
  }
}
