import { types as utilTypes } from 'node:util';
import * as AI from 'ai';
import { stepCountIs } from 'ai';
import { ValidationError } from '@outputai/core';
import { validateGenerateTextArgs, validateStreamTextArgs, validateGenerateImageArgs } from './validations.js';
import { loadPrompt } from './prompt/loader.js';
import { startTrace, endTraceWithError } from './utils/trace.js';
import { wrapTextResponse, wrapStreamOnFinishResponse, wrapImageResponse } from './utils/response_wrappers.js';
import { loadAiSdkTextOptions, loadAiSdkImageOptions } from './ai_sdk_options.js';
import { prepareTextPrompt } from './prompt/prepare_text.js';
import { mapAiError } from './utils/error_handler.js';

export async function generateText( { prompt, variables, promptDir, skills = [], maxSteps = 10, ...aiSdkArgs } ) {
  validateGenerateTextArgs( { prompt, variables, promptDir, skills, maxSteps } );

  const parsedSkills = typeof skills === 'function' ? await skills( variables ) : skills;
  const { loadedPrompt, tools } = prepareTextPrompt( { prompt, variables, promptDir, skills: parsedSkills, tools: aiSdkArgs.tools } );

  const traceId = startTrace( { name: 'generateText', prompt, variables, loadedPrompt } );
  const { model: modelId } = loadedPrompt.config;

  try {
    const response = await AI.generateText( {
      ...loadAiSdkTextOptions( loadedPrompt ),
      allowSystemInMessages: true,
      maxRetries: 0,
      ...aiSdkArgs,
      ...( tools && { tools } ),
      ...( tools && !aiSdkArgs.stopWhen ? { stopWhen: stepCountIs( maxSteps ) } : {} )
    } );
    return wrapTextResponse( { traceId, modelId, response } );
  } catch ( originalError ) {
    const error = mapAiError( originalError );
    endTraceWithError( { traceId, error } );
    throw error;
  }
}

export function streamText( { prompt, variables, promptDir, skills = [], maxSteps = 10, onFinish, onError: _onError, ...aiSdkArgs } ) {
  validateStreamTextArgs( { prompt, variables, promptDir, skills, maxSteps } );

  const parsedSkills = typeof skills === 'function' ? skills( variables ) : skills;
  if ( utilTypes.isPromise( parsedSkills ) ) {
    throw new ValidationError( 'streamText() skills must be synchronous because streamText() returns a stream immediately.' );
  }
  const { loadedPrompt, tools } = prepareTextPrompt( { prompt, variables, promptDir, skills: parsedSkills, tools: aiSdkArgs.tools } );

  const traceId = startTrace( { name: 'streamText', prompt, variables, loadedPrompt } );
  const { model: modelId } = loadedPrompt.config;

  try {
    return AI.streamText( {
      ...loadAiSdkTextOptions( loadedPrompt ),
      allowSystemInMessages: true,
      maxRetries: 0,
      ...aiSdkArgs,
      ...( tools && { tools } ),
      ...( tools && !aiSdkArgs.stopWhen ? { stopWhen: stepCountIs( maxSteps ) } : {} ),
      ...wrapStreamOnFinishResponse( { traceId, modelId, onFinish } ),
      onError( event ) {
        const error = mapAiError( event.error );
        endTraceWithError( { traceId, error } );
        _onError?.( { ...event, error } );
      }
    } );
  } catch ( originalError ) {
    const error = mapAiError( originalError );
    endTraceWithError( { traceId, error } );
    throw error;
  }
}

export async function generateImage( { prompt, variables, promptDir, images, mask, ...aiSdkArgs } ) {
  validateGenerateImageArgs( { prompt, variables, promptDir, images, mask } );

  const loadedPrompt = loadPrompt( prompt, variables, promptDir );
  const traceId = startTrace( { name: 'generateImage', prompt, variables, loadedPrompt } );
  const { model: modelId } = loadedPrompt.config;

  try {
    const response = await AI.generateImage( {
      ...loadAiSdkImageOptions( { prompt: loadedPrompt, images, mask } ),
      maxRetries: 0,
      ...aiSdkArgs
    } );
    return wrapImageResponse( { traceId, modelId, response } );
  } catch ( originalError ) {
    const error = mapAiError( originalError );
    endTraceWithError( { traceId, error } );
    throw error;
  }
}
