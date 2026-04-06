import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AfterResponseState, KyRequest, KyResponse } from 'ky';
import { traceResponse } from './trace_response.js';
import { Tracing } from '@outputai/core/sdk_activity_integration';
import { config } from '../config.js';

vi.mock( '../utils/index.js', () => ( {
  redactHeaders: vi.fn( ( h: Record<string, string> ) => h ),
  parseResponseBody: vi.fn( async () => ( { mocked: true } ) ),
  createTraceId: vi.fn( () => 'trace-id' )
} ) );

vi.mock( '@outputai/core/sdk_activity_integration', () => ( {
  Tracing: {
    addEventEnd: vi.fn()
  }
} ) );

vi.mock( '../config.js', () => ( {
  config: { logVerbose: false }
} ) );

const mockedTracing = vi.mocked( Tracing, true );
const mockedConfig = vi.mocked( config );

describe( 'http/hooks/trace_response', () => {
  beforeEach( () => {
    mockedTracing.addEventEnd.mockClear();
    mockedConfig.logVerbose = false;
  } );

  it( 'traces minimal details when verbose logging is disabled', async () => {
    mockedConfig.logVerbose = false;

    const request = new Request( 'https://api.example.com/users/1', { method: 'GET' } ) as KyRequest;
    const response = new Response( 'ok', { status: 200, statusText: 'OK' } ) as KyResponse;

    const result = await traceResponse( { request, response } as AfterResponseState );
    expect( result ).toBe( response );

    expect( mockedTracing.addEventEnd ).toHaveBeenCalledTimes( 1 );
    const arg = mockedTracing.addEventEnd.mock.calls[0][0] as { details: Record<string, unknown> };
    expect( arg.details ).toEqual( { status: 200, statusText: 'OK' } );
  } );

  it( 'traces headers and parsed JSON body when verbose logging is enabled', async () => {
    mockedConfig.logVerbose = true;

    const request = new Request( 'https://api.example.com/users', { method: 'POST' } ) as KyRequest;
    const response = new Response( JSON.stringify( { success: true } ), {
      status: 201,
      statusText: 'Created',
      headers: { 'content-type': 'application/json', authorization: 'secret', 'x-custom': 'v' }
    } ) as KyResponse;

    await traceResponse( { request, response } as AfterResponseState );

    const arg = mockedTracing.addEventEnd.mock.calls[0][0] as { details: Record<string, unknown> };
    expect( arg.details.status ).toBe( 201 );
    expect( arg.details.statusText ).toBe( 'Created' );
    expect( arg.details.headers ).toEqual( { 'content-type': 'application/json', authorization: 'secret', 'x-custom': 'v' } );
    expect( arg.details.body ).toEqual( { mocked: true } );
  } );

  it( 'traces text body for non-JSON content types', async () => {
    mockedConfig.logVerbose = true;

    const request = new Request( 'https://api.example.com/ping', { method: 'GET' } ) as KyRequest;
    const response = new Response( 'pong', {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/plain' }
    } ) as KyResponse;

    await traceResponse( { request, response } as AfterResponseState );

    const arg = mockedTracing.addEventEnd.mock.calls[0][0] as { details: Record<string, unknown> };
    expect( arg.details.body ).toEqual( { mocked: true } );
  } );
} );
