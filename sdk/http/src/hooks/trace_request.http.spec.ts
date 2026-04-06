import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BeforeRequestHook } from 'ky';
import ky from 'ky';
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici';
import { traceRequest } from './trace_request.js';
import { Tracing } from '@outputai/core/sdk_activity_integration';
import { config } from '../config.js';

/** Ky v2 passes hook state; mirrors assignRequestId for these integration tests. */
const assignRequestIdForTest: BeforeRequestHook = ( { request } ) => {
  if ( !request.headers.get( 'X-Request-ID' ) ) {
    request.headers.set( 'X-Request-ID', randomUUID() );
  }
};

vi.mock( '@outputai/core/sdk_activity_integration', () => ( {
  Tracing: {
    addEventStart: vi.fn()
  }
} ) );

vi.mock( '../config.js', () => ( {
  config: { logVerbose: false }
} ) );

const MOCK_ORIGIN = 'https://trace-hooks.undici.test';

const mockedTracing = vi.mocked( Tracing, true );
const mockedConfig = vi.mocked( config );

describe( 'http/hooks/trace_request (MockAgent)', () => {
  const undiciCtx = {
    mockAgent: undefined as InstanceType<typeof MockAgent> | undefined,
    previousDispatcher: undefined as ReturnType<typeof getGlobalDispatcher> | undefined
  };

  beforeEach( () => {
    undiciCtx.mockAgent = new MockAgent();
    undiciCtx.mockAgent.disableNetConnect();
    undiciCtx.previousDispatcher = getGlobalDispatcher();
    setGlobalDispatcher( undiciCtx.mockAgent );
    mockedTracing.addEventStart.mockClear();
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

  it( 'records start event after a mocked GET', async () => {
    undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( { path: '/users/1', method: 'GET' } ).reply( 200, 'ok' );

    const client = ky.create( {
      prefix: MOCK_ORIGIN,
      retry: { limit: 0 },
      hooks: {
        beforeRequest: [ assignRequestIdForTest, traceRequest ]
      }
    } );

    await client.get( 'users/1' );

    expect( mockedTracing.addEventStart ).toHaveBeenCalledTimes( 1 );
    const arg = mockedTracing.addEventStart.mock.calls[0][0] as {
      id: string;
      kind: string;
      name: string;
      details: { method: string; url: string; headers?: Record<string, string>; body?: unknown };
    };
    expect( arg.kind ).toBe( 'http' );
    expect( arg.name ).toBe( 'request' );
    expect( arg.id ).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
    );
    expect( arg.details ).toEqual( {
      method: 'GET',
      url: `${MOCK_ORIGIN}/users/1`
    } );
  } );

  it( 'includes redacted headers and JSON body when verbose tracing is enabled', async () => {
    mockedConfig.logVerbose = true;

    undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( { path: '/users', method: 'POST' } ).reply( 201, { created: true } );

    const client = ky.create( {
      prefix: MOCK_ORIGIN,
      retry: { limit: 0 },
      hooks: {
        beforeRequest: [ assignRequestIdForTest, traceRequest ]
      }
    } );

    await client.post( 'users', {
      json: { name: 'test' },
      headers: { authorization: 'secret-token', 'x-custom': 'v' }
    } );

    expect( mockedTracing.addEventStart ).toHaveBeenCalledTimes( 1 );
    const arg = mockedTracing.addEventStart.mock.calls[0][0] as {
      details: { method: string; url: string; headers?: Record<string, string>; body?: unknown };
    };
    expect( arg.details.method ).toBe( 'POST' );
    expect( arg.details.url ).toBe( `${MOCK_ORIGIN}/users` );
    expect( arg.details.headers ).toMatchObject( {
      authorization: '[REDACTED]',
      'x-custom': 'v'
    } );
    expect( arg.details.body ).toEqual( { name: 'test' } );
  } );
} );
