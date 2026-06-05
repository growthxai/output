import { describe, expect, it } from 'vitest';
import {
  APICallError,
  InvalidArgumentError,
  InvalidDataContentError,
  InvalidMessageRoleError,
  InvalidPromptError,
  InvalidToolApprovalError,
  InvalidToolInputError,
  LoadAPIKeyError,
  LoadSettingError,
  MessageConversionError,
  NoImageGeneratedError,
  NoOutputGeneratedError,
  NoObjectGeneratedError,
  NoSuchModelError,
  NoSuchProviderError,
  ToolCallNotFoundForApprovalError,
  ToolCallRepairError,
  UnsupportedFunctionalityError
} from 'ai';
import { FatalError } from '@outputai/core';
import { mapAiError } from './error_handler.js';

const makeApiCallError = ( input = {} ) => new APICallError( {
  message: 'Provider rejected the request',
  url: 'https://provider.test/v1/generate',
  requestBodyValues: {},
  responseHeaders: {},
  responseBody: '{"error":"bad request"}',
  ...input
} );

const fatalAiSdkErrors = [
  [
    'InvalidArgumentError',
    () => new InvalidArgumentError( {
      parameter: 'temperature',
      value: 'hot',
      message: 'temperature must be a number'
    } )
  ],
  [
    'InvalidDataContentError',
    () => new InvalidDataContentError( { content: { bad: true } } )
  ],
  [
    'InvalidPromptError',
    () => new InvalidPromptError( { prompt: {}, message: 'prompt or messages must be defined' } )
  ],
  [
    'LoadAPIKeyError',
    () => new LoadAPIKeyError( { message: 'Missing API key' } )
  ],
  [
    'LoadSettingError',
    () => new LoadSettingError( { message: 'Missing setting' } )
  ],
  [
    'NoImageGeneratedError',
    () => new NoImageGeneratedError( { responses: [] } )
  ],
  [
    'NoSuchModelError',
    () => new NoSuchModelError( { modelId: 'missing-model', modelType: 'languageModel' } )
  ],
  [
    'NoSuchProviderError',
    () => new NoSuchProviderError( {
      modelId: 'missing-provider:model',
      modelType: 'languageModel',
      providerId: 'missing-provider',
      availableProviders: [ 'openai' ]
    } )
  ],
  [
    'UnsupportedFunctionalityError',
    () => new UnsupportedFunctionalityError( { functionality: 'image masks' } )
  ]
];

const preservedAiSdkErrors = [
  [
    'InvalidMessageRoleError',
    () => new InvalidMessageRoleError( { role: 'critic' } )
  ],
  [
    'InvalidToolApprovalError',
    () => new InvalidToolApprovalError( { approvalId: 'approval-1' } )
  ],
  [
    'InvalidToolInputError',
    () => new InvalidToolInputError( {
      toolName: 'search',
      toolInput: '{bad json',
      cause: new Error( 'parse failed' )
    } )
  ],
  [
    'MessageConversionError',
    () => new MessageConversionError( {
      originalMessage: { role: 'critic', content: 'bad role' },
      message: 'Unsupported role'
    } )
  ],
  [
    'NoObjectGeneratedError',
    () => new NoObjectGeneratedError( {
      text: 'not json',
      cause: new Error( 'parse failed' )
    } )
  ],
  [
    'NoOutputGeneratedError',
    () => new NoOutputGeneratedError()
  ],
  [
    'ToolCallNotFoundForApprovalError',
    () => new ToolCallNotFoundForApprovalError( {
      toolCallId: 'tool-call-1',
      approvalId: 'approval-1'
    } )
  ],
  [
    'ToolCallRepairError',
    () => new ToolCallRepairError( {
      cause: new Error( 'repair failed' ),
      originalError: new Error( 'invalid tool input' )
    } )
  ]
];

describe( 'mapAiError', () => {
  it( 'preserves existing FatalError instances', () => {
    const error = new FatalError( 'Already fatal' );

    expect( mapAiError( error ) ).toBe( error );
  } );

  it( 'maps non-retryable APICallError instances to FatalError', () => {
    const error = makeApiCallError( {
      statusCode: 400,
      isRetryable: false
    } );

    const result = mapAiError( error );

    expect( result ).toBeInstanceOf( FatalError );
    expect( result.message ).toBe( 'AI-SDK fatal error (HTTP 400): Provider rejected the request' );
    expect( result.cause ).toBe( error );
  } );

  it( 'maps non-retryable APICallError instances without status codes to FatalError', () => {
    const error = makeApiCallError( {
      isRetryable: false
    } );

    const result = mapAiError( error );

    expect( result ).toBeInstanceOf( FatalError );
    expect( result.message ).toBe( 'AI-SDK fatal error: Provider rejected the request' );
    expect( result.cause ).toBe( error );
  } );

  it( 'preserves retryable APICallError instances', () => {
    const error = makeApiCallError( {
      statusCode: 429,
      isRetryable: true
    } );

    expect( mapAiError( error ) ).toBe( error );
  } );

  it.each( fatalAiSdkErrors )( 'maps %s to FatalError', ( _name, makeError ) => {
    const error = makeError();

    const result = mapAiError( error );

    expect( result ).toBeInstanceOf( FatalError );
    expect( result.message ).toBe( `AI-SDK fatal error: ${error.message}` );
    expect( result.cause ).toBe( error );
  } );

  it.each( preservedAiSdkErrors )( 'preserves %s for now', ( _name, makeError ) => {
    const error = makeError();

    expect( mapAiError( error ) ).toBe( error );
  } );

  it( 'preserves ordinary errors', () => {
    const error = new Error( 'Network exploded' );

    expect( mapAiError( error ) ).toBe( error );
  } );
} );
