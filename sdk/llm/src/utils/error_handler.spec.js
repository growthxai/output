import { describe, expect, it } from 'vitest';
import { APICallError } from 'ai';
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
    expect( result.message ).toBe( 'AI-SDK permanent error with HTTP 400: Provider rejected the request' );
    expect( result.cause ).toBe( error );
  } );

  it( 'maps non-retryable APICallError instances without status codes to FatalError', () => {
    const error = makeApiCallError( {
      isRetryable: false
    } );

    const result = mapAiError( error );

    expect( result ).toBeInstanceOf( FatalError );
    expect( result.message ).toBe( 'AI-SDK permanent error: Provider rejected the request' );
    expect( result.cause ).toBe( error );
  } );

  it( 'preserves retryable APICallError instances', () => {
    const error = makeApiCallError( {
      statusCode: 429,
      isRetryable: true
    } );

    expect( mapAiError( error ) ).toBe( error );
  } );

  it( 'preserves ordinary errors', () => {
    const error = new Error( 'Network exploded' );

    expect( mapAiError( error ) ).toBe( error );
  } );
} );
