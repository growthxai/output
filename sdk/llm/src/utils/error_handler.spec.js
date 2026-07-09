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
import { findInstanceInCauseChain, mapAiError } from './error_handler.js';

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

describe( 'findInstanceInCauseChain', () => {
  class FirstCustomError extends Error {}
  class SecondCustomError extends Error {}

  it( 'returns the input error when it matches the target constructor', () => {
    const error = new FirstCustomError( 'first' );

    expect( findInstanceInCauseChain( error, FirstCustomError ) ).toBe( error );
  } );

  it( 'returns the input error when it matches the target constructor name', () => {
    const error = new FirstCustomError( 'first' );

    expect( findInstanceInCauseChain( error, 'FirstCustomError' ) ).toBe( error );
  } );

  it( 'walks the cause chain to find an error by constructor', () => {
    const target = new SecondCustomError( 'second' );
    const wrapper = new FirstCustomError( 'first', { cause: target } );

    expect( findInstanceInCauseChain( wrapper, SecondCustomError ) ).toBe( target );
  } );

  it( 'walks the cause chain to find an error by constructor name', () => {
    const target = new SecondCustomError( 'second' );
    const wrapper = new FirstCustomError( 'first', { cause: target } );

    expect( findInstanceInCauseChain( wrapper, 'SecondCustomError' ) ).toBe( target );
  } );

  it( 'returns null when the target is not found', () => {
    const error = new FirstCustomError( 'first', { cause: new Error( 'root' ) } );

    expect( findInstanceInCauseChain( error, SecondCustomError ) ).toBeNull();
  } );

  it( 'returns null for empty or non-object inputs', () => {
    expect( findInstanceInCauseChain( null, Error ) ).toBeNull();
    expect( findInstanceInCauseChain( 'not an error', Error ) ).toBeNull();
  } );

  it( 'returns null for object causes without constructors', () => {
    const cause = Object.create( null );
    const error = new FirstCustomError( 'first', { cause } );

    expect( findInstanceInCauseChain( error, 'SecondCustomError' ) ).toBeNull();
  } );

  it( 'stops searching after the depth limit', () => {
    const makeErrorChain = depth => depth === 0 ?
      new SecondCustomError( 'target' ) :
      new FirstCustomError( `level ${depth}`, { cause: makeErrorChain( depth - 1 ) } );

    expect( findInstanceInCauseChain( makeErrorChain( 11 ), SecondCustomError ) ).toBeNull();
  } );
} );

describe( 'mapAiError', () => {
  it( 'preserves existing FatalError instances', () => {
    const error = new FatalError( 'Already fatal' );

    expect( mapAiError( error ) ).toBe( error );
  } );

  it( 'adds first schema issue details to NoObjectGeneratedError schema mismatches', () => {
    class ZodError extends Error {
      constructor( issues ) {
        super( 'schema failed' );
        this.issues = issues;
      }
    }
    const zodError = new ZodError( [
      {
        path: [ 'items', 0, 'title' ],
        message: 'Expected string'
      }
    ] );
    const validationError = new Error( 'validation failed', { cause: zodError } );
    const error = new NoObjectGeneratedError( {
      message: 'No object generated: response did not match schema.',
      text: '{"items":[{}]}',
      response: { id: 'response-1' },
      usage: { totalTokens: 10 },
      finishReason: 'stop',
      cause: validationError
    } );

    const result = mapAiError( error );

    expect( result ).not.toBe( error );
    expect( NoObjectGeneratedError.isInstance( result ) ).toBe( true );
    expect( result.name ).toBe( 'AI_NoObjectGeneratedError' );
    expect( result.message ).toBe(
      'No object generated: response did not match schema. First issue is "Expected string" at path [items, 0, title].'
    );
    expect( result.cause ).toBe( validationError );
    expect( result.text ).toBe( error.text );
    expect( result.response ).toBe( error.response );
    expect( result.usage ).toBe( error.usage );
    expect( result.finishReason ).toBe( error.finishReason );
  } );

  it( 'preserves NoObjectGeneratedError schema mismatches when no schema issue is available', () => {
    const error = new NoObjectGeneratedError( {
      message: 'No object generated: response did not match schema.',
      text: '{"items":[{}]}',
      cause: new Error( 'validation failed' )
    } );

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

  it( 'preserves Anthropic grammar compilation timeouts as retryable activity failures', () => {
    const error = makeApiCallError( {
      message: 'Grammar compilation timed out.',
      statusCode: 400,
      isRetryable: false
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
