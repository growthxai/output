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

export async function generateText( { prompt, variables, promptDir, maxSteps = 10, tools, skills, ...aiSdkArgs } ) {
  validateGenerateTextArgs( { prompt, variables, promptDir, maxSteps, tools, skills } );

  const loadedPrompt = loadPrompt( prompt, variables, promptDir );
  const loadedSkills = loadSkills( loadedPrompt );

  const traceId = startTrace( { name: 'generateText', prompt, variables, loadedPrompt } );
  const { model: modelId, provider: providerId } = loadedPrompt.config;

  try {
    const response = await AI.generateText( {
      ...loadAiSdkTextOptions( { prompt: loadedPrompt, skills: loadedSkills, tools, maxSteps } ),
      ...defaultAiSdkOptions,
      ...aiSdkArgs
    } );
    return wrapTextResponse( { traceId, providerId, modelId, response } );
  } catch ( originalError ) {
    const error = mapAiError( originalError );
    endTraceWithError( { traceId, error } );
    throw error;
  }
}

export function streamText( { prompt, variables, promptDir, maxSteps = 10, onFinish, onError, tools, skills, ...aiSdkArgs } ) {
  validateStreamTextArgs( { prompt, variables, promptDir, maxSteps, onFinish, onError, tools, skills } );

  const loadedPrompt = loadPrompt( prompt, variables, promptDir );
  const loadedSkills = loadSkills( loadedPrompt );

  const traceId = startTrace( { name: 'streamText', prompt, variables, loadedPrompt } );
  const { model: modelId, provider: providerId } = loadedPrompt.config;

  try {
    return AI.streamText( {
      ...loadAiSdkTextOptions( { prompt: loadedPrompt, skills: loadedSkills, tools, maxSteps } ),
      ...defaultAiSdkOptions,
      ...aiSdkArgs,
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
export async function generateTextWithStreaming( { prompt, variables, promptDir, maxSteps = 10, tools, skills, ...aiSdkArgs } ) {
  validateGenerateTextWithStreamingArgs( { prompt, variables, promptDir, maxSteps, tools, skills } );

  const loadedPrompt = loadPrompt( prompt, variables, promptDir );
  const loadedSkills = loadSkills( loadedPrompt );

  const traceId = startTrace( { name: 'generateTextWithStreaming', prompt, variables, loadedPrompt } );

  const { model: modelId, provider: providerId } = loadedPrompt.config;
  const state = { response: null };

  try {
    const stream = AI.streamText( {
      ...loadAiSdkTextOptions( { prompt: loadedPrompt, skills: loadedSkills, tools, maxSteps } ),
      ...defaultAiSdkOptions,
      ...aiSdkArgs,
      onFinish( response ) {
        state.response = response;
      },
      onError: _ => {} // Suppress AI-SDK console printing
    } );

    await drainStream( stream, aiSdkArgs?.abortSignal );

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

export async function generateImage( { prompt, variables, promptDir, images, mask, ...aiSdkArgs } ) {
  validateGenerateImageArgs( { prompt, variables, promptDir, images, mask } );

  const loadedPrompt = loadPrompt( prompt, variables, promptDir );
  const traceId = startTrace( { name: 'generateImage', prompt, variables, loadedPrompt } );
  const { model: modelId, provider: providerId } = loadedPrompt.config;

  try {
    const response = await AI.generateImage( {
      ...loadAiSdkImageOptions( { prompt: loadedPrompt, images, mask } ),
      maxRetries: defaultAiSdkOptions.maxRetries,
      ...aiSdkArgs
    } );
    return wrapImageResponse( { traceId, providerId, modelId, response } );
  } catch ( originalError ) {
    const error = mapAiError( originalError );
    endTraceWithError( { traceId, error } );
    throw error;
  }
}
