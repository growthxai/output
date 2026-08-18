import { types as utilTypes } from 'node:util';
import * as AI from 'ai';
import { stepCountIs } from 'ai';
import { ValidationError } from '@outputai/core';
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
import { prepareTextPrompt } from './prompt/prepare_text.js';
import { mapAiError } from './utils/error_handler.js';

const defaultAiSdkOptions = {
  allowSystemInMessages: true,
  maxRetries: 0
};

export async function generateText( { prompt, variables, promptDir, skills = [], maxSteps = 10, ...aiSdkArgs } ) {
  validateGenerateTextArgs( { prompt, variables, promptDir, skills, maxSteps } );

  const parsedSkills = typeof skills === 'function' ? await skills( variables ) : skills;
  const { loadedPrompt, tools } = prepareTextPrompt( { prompt, variables, promptDir, skills: parsedSkills, tools: aiSdkArgs.tools } );

  const traceId = startTrace( { name: 'generateText', prompt, variables, loadedPrompt } );
  const { model: modelId, provider: providerId } = loadedPrompt.config;

  try {
    const response = await AI.generateText( {
      ...loadAiSdkTextOptions( loadedPrompt ),
      ...defaultAiSdkOptions,
      ...aiSdkArgs,
      ...( tools && { tools } ),
      ...( tools && !aiSdkArgs.stopWhen ? { stopWhen: stepCountIs( maxSteps ) } : {} )
    } );
    return wrapTextResponse( { traceId, providerId, modelId, response } );
  } catch ( originalError ) {
    const error = mapAiError( originalError );
    endTraceWithError( { traceId, error } );
    throw error;
  }
}

export function streamText( { prompt, variables, promptDir, skills = [], maxSteps = 10, onFinish, onError, ...aiSdkArgs } ) {
  validateStreamTextArgs( { prompt, variables, promptDir, skills, maxSteps, onFinish, onError } );

  const parsedSkills = typeof skills === 'function' ? skills( variables ) : skills;
  if ( utilTypes.isPromise( parsedSkills ) ) {
    throw new ValidationError( 'streamText() skills must be synchronous because streamText() returns a stream immediately.' );
  }
  const { loadedPrompt, tools } = prepareTextPrompt( { prompt, variables, promptDir, skills: parsedSkills, tools: aiSdkArgs.tools } );

  const traceId = startTrace( { name: 'streamText', prompt, variables, loadedPrompt } );
  const { model: modelId, provider: providerId } = loadedPrompt.config;

  try {
    return AI.streamText( {
      ...loadAiSdkTextOptions( loadedPrompt ),
      ...defaultAiSdkOptions,
      ...aiSdkArgs,
      ...( tools && { tools } ),
      ...( tools && !aiSdkArgs.stopWhen ? { stopWhen: stepCountIs( maxSteps ) } : {} ),
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
export async function generateTextWithStreaming( {
  prompt,
  variables,
  promptDir,
  skills = [],
  maxSteps = 10,
  onFinish,
  onError,
  ...aiSdkArgs
} ) {
  validateGenerateTextWithStreamingArgs( { prompt, variables, promptDir, skills, maxSteps, onFinish, onError } );

  const parsedSkills = typeof skills === 'function' ? await skills( variables ) : skills;
  const { loadedPrompt, tools } = prepareTextPrompt( { prompt, variables, promptDir, skills: parsedSkills, tools: aiSdkArgs.tools } );
  const traceId = startTrace( { name: 'generateTextWithStreaming', prompt, variables, loadedPrompt } );
  const { model: modelId, provider: providerId } = loadedPrompt.config;
  const state = {
    response: null,
    wrappedResponse: null
  };

  try {
    const stream = AI.streamText( {
      ...loadAiSdkTextOptions( loadedPrompt ),
      ...defaultAiSdkOptions,
      ...aiSdkArgs,
      ...( tools && { tools } ),
      ...( tools && !aiSdkArgs.stopWhen ? { stopWhen: stepCountIs( maxSteps ) } : {} ),
      onFinish( response ) {
        state.response = response;
      },
      onError( event ) {
        throw event.error;
      }
    } );

    for await ( const part of stream.fullStream ) {
      if ( part.type === 'abort' ) {
        const reason = aiSdkArgs.abortSignal?.reason;
        throw reason instanceof Error ?
          reason :
          new Error( part.reason ?? 'Streaming generation aborted.', { cause: reason } );
      }
    }

    if ( !state.response ) {
      throw new Error( 'Streaming generation completed without a response.' );
    }

    const output = await stream.output;
    state.wrappedResponse = await wrapTextResponse( { traceId, providerId, modelId, response: state.response, extraProperties: { output } } );
  } catch ( error ) {
    const mappedError = mapAiError( error );
    endTraceWithError( { traceId, error: mappedError } );
    try {
      await onError?.( { error: mappedError } );
    } catch {}
    throw mappedError;
  }

  await onFinish?.( state.wrappedResponse );
  return state.wrappedResponse;
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
