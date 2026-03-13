import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { KyRequest, NormalizedOptions } from 'ky';
import { traceRequest } from './trace_request.js';
import { Tracing } from '@outputai/core/sdk_activity_integration';
import { config } from '../config.js';

vi.mock( '../utils/index.js', () => ( {
  redactHeaders: vi.fn( ( h: Record<string, string> ) => h ),
  parseRequestBody: vi.fn( async () => ( { mocked: true } ) ),
  createTraceId: vi.fn( () => 'trace-id' )
} ) );

vi.mock( '@outputai/core/sdk_activity_integration', () => ( {
  Tracing: {
    addEventStart: vi.fn()
  }
} ) );

vi.mock( '../config.js', () => ( {
  config: { logVerbose: false }
} ) );

const mockedTracing = vi.mocked( Tracing, true );
const mockedConfig = vi.mocked( config );

describe( 'http/hooks/trace_request', () => {
  beforeEach( () => {
    mockedTracing.addEventStart.mockClear();
    mockedConfig.logVerbose = false;
  } );

  it( 'traces minimal details when verbose logging is disabled', async () => {
    mockedConfig.logVerbose = false;

    const request = new Request( 'https://api.example.com/users/1', { method: 'GET' } ) as KyRequest;
    const options = {} as NormalizedOptions;
    const state = { retryCount: 0 };

    await traceRequest( request, options, state );

    expect( mockedTracing.addEventStart ).toHaveBeenCalledTimes( 1 );
    const arg = mockedTracing.addEventStart.mock.calls[0][0] as { details: Record<string, unknown> };
    expect( arg ).toHaveProperty( 'kind', 'http' );
    expect( arg ).toHaveProperty( 'name', 'request' );
    expect( arg.details ).toEqual( {
      method: 'GET',
      url: 'https://api.example.com/users/1'
    } );
  } );

  it( 'traces headers and parsed body when verbose logging is enabled', async () => {
    mockedConfig.logVerbose = true;

    const request = new Request( 'https://api.example.com/users', {
      method: 'POST',
      headers: {
        authorization: 'secret',
        'x-custom': 'value'
      },
      body: JSON.stringify( { name: 'test' } )
    } ) as KyRequest;
    const options = {} as NormalizedOptions;
    const state = { retryCount: 0 };

    await traceRequest( request, options, state );

    expect( mockedTracing.addEventStart ).toHaveBeenCalledTimes( 1 );
    const arg = mockedTracing.addEventStart.mock.calls[0][0] as { details: Record<string, unknown> };
    expect( arg.details.method ).toBe( 'POST' );
    expect( arg.details.url ).toBe( 'https://api.example.com/users' );
    expect( arg.details.headers ).toMatchObject( { authorization: 'secret', 'x-custom': 'value' } );
    expect( arg.details.body ).toEqual( { mocked: true } );
  } );
} );
