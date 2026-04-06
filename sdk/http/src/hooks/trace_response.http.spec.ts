import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BeforeRequestHook } from 'ky';
import ky from 'ky';
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici';
import { traceResponse } from './trace_response.js';
import { Tracing } from '@outputai/core/sdk_activity_integration';
import { config } from '../config.js';

const assignRequestIdForTest: BeforeRequestHook = ( { request } ) => {
  if ( !request.headers.get( 'X-Request-ID' ) ) {
    request.headers.set( 'X-Request-ID', randomUUID() );
  }
};

vi.mock( '@outputai/core/sdk_activity_integration', () => ( {
  Tracing: {
    addEventEnd: vi.fn()
  }
} ) );

vi.mock( '../config.js', () => ( {
  config: { logVerbose: false }
} ) );

const MOCK_ORIGIN = 'https://trace-hooks.undici.test';

const mockedTracing = vi.mocked( Tracing, true );
const mockedConfig = vi.mocked( config );

describe( 'http/hooks/trace_response (MockAgent)', () => {
  const undiciCtx = {
    mockAgent: undefined as InstanceType<typeof MockAgent> | undefined,
    previousDispatcher: undefined as ReturnType<typeof getGlobalDispatcher> | undefined
  };

  beforeEach( () => {
    undiciCtx.mockAgent = new MockAgent();
    undiciCtx.mockAgent.disableNetConnect();
    undiciCtx.previousDispatcher = getGlobalDispatcher();
    setGlobalDispatcher( undiciCtx.mockAgent );
    mockedTracing.addEventEnd.mockClear();
    mockedConfig.logVerbose = false;
  } );

  afterEach( async () => {
    if ( undiciCtx.previousDispatcher !== undefined ) {
      setGlobalDispatcher( undiciCtx.previousDispatcher );
    }
    if ( undiciCtx.mockAgent !== undefined ) {
      await undiciCtx.mockAgent.close();
    }
  } );

  it( 'records end event for a mocked JSON response', async () => {
    undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( { path: '/users/1', method: 'GET' } ).reply(
      200,
      JSON.stringify( { id: 1 } ),
      { headers: { 'content-type': 'application/json' } }
    );

    const client = ky.create( {
      prefix: MOCK_ORIGIN,
      retry: { limit: 0 },
      hooks: {
        beforeRequest: [ assignRequestIdForTest ],
        afterResponse: [ traceResponse ]
      }
    } );

    await client.get( 'users/1' ).json();

    expect( mockedTracing.addEventEnd ).toHaveBeenCalledTimes( 1 );
    const arg = mockedTracing.addEventEnd.mock.calls[0][0] as {
      id: string;
      details: { status: number; statusText: string; headers?: Record<string, string>; body?: unknown };
    };
    expect( arg.details ).toEqual( { status: 200, statusText: 'OK' } );
  } );

  it( 'includes redacted headers and parsed body when verbose tracing is enabled', async () => {
    mockedConfig.logVerbose = true;

    undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( { path: '/items', method: 'GET' } ).reply(
      200,
      JSON.stringify( { ok: true } ),
      {
        headers: {
          'content-type': 'application/json',
          authorization: 'secret',
          'x-custom': 'v'
        }
      }
    );

    const client = ky.create( {
      prefix: MOCK_ORIGIN,
      retry: { limit: 0 },
      hooks: {
        beforeRequest: [ assignRequestIdForTest ],
        afterResponse: [ traceResponse ]
      }
    } );

    await client.get( 'items' ).json();

    const arg = mockedTracing.addEventEnd.mock.calls[0][0] as {
      details: { status: number; statusText: string; headers?: Record<string, string>; body?: unknown };
    };
    expect( arg.details.status ).toBe( 200 );
    expect( arg.details.statusText ).toBe( 'OK' );
    expect( arg.details.headers ).toMatchObject( {
      'content-type': 'application/json',
      authorization: '[REDACTED]',
      'x-custom': 'v'
    } );
    expect( arg.details.body ).toEqual( { ok: true } );
  } );
} );
