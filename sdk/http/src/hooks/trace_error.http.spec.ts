import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { BeforeRequestHook } from 'ky';
import ky, { HTTPError, NetworkError } from 'ky';
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici';
import { traceError } from './trace_error.js';
import { Tracing } from '@outputai/core/sdk_activity_integration';

const assignRequestIdForTest: BeforeRequestHook = ( { request } ) => {
  if ( !request.headers.get( 'X-Request-ID' ) ) {
    request.headers.set( 'X-Request-ID', randomUUID() );
  }
};

vi.mock( '@outputai/core/sdk_activity_integration', () => ( {
  Tracing: {
    addEventError: vi.fn()
  }
} ) );

const MOCK_ORIGIN = 'https://trace-hooks.undici.test';

/** Port unlikely to accept connections; used for real ECONNREFUSED from undici. */
const REFUSED_PORT = 65431;
const REFUSED_URL = `http://127.0.0.1:${REFUSED_PORT}/nolistener`;

const mockedTracing = vi.mocked( Tracing, true );

const kyWithTraceError = () => ky.create( {
  retry: { limit: 0 },
  hooks: {
    beforeRequest: [ assignRequestIdForTest ],
    beforeError: [ traceError ]
  }
} );

describe( 'http/hooks/trace_error (MockAgent)', () => {
  const undiciCtx = {
    mockAgent: undefined as InstanceType<typeof MockAgent> | undefined,
    previousDispatcher: undefined as ReturnType<typeof getGlobalDispatcher> | undefined
  };

  beforeEach( () => {
    undiciCtx.mockAgent = new MockAgent();
    undiciCtx.mockAgent.disableNetConnect();
    undiciCtx.previousDispatcher = getGlobalDispatcher();
    setGlobalDispatcher( undiciCtx.mockAgent );
    mockedTracing.addEventError.mockClear();
  } );

  afterEach( async () => {
    if ( undiciCtx.previousDispatcher !== undefined ) {
      setGlobalDispatcher( undiciCtx.previousDispatcher );
    }
    if ( undiciCtx.mockAgent !== undefined ) {
      await undiciCtx.mockAgent.close();
    }
  } );

  it( 'records HTTP error details from a mocked 401 response', async () => {
    undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( { path: '/restricted', method: 'GET' } ).reply(
      401,
      'Unauthorized',
      {
        headers: {
          'content-type': 'text/plain',
          authorization: 'secret',
          'x-custom': 'v'
        }
      }
    );

    const client = kyWithTraceError().extend( { prefix: MOCK_ORIGIN } );

    await expect( client.get( 'restricted' ).text() ).rejects.toBeInstanceOf( HTTPError );

    expect( mockedTracing.addEventError ).toHaveBeenCalledTimes( 1 );
    const arg = mockedTracing.addEventError.mock.calls[0][0] as {
      id: string;
      details: {
        status: number;
        statusText: string;
        headers: Record<string, string>;
      };
    };
    expect( arg.id ).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
    );
    expect( arg.details.status ).toBe( 401 );
    expect( arg.details.statusText ).toBe( 'Unauthorized' );
    expect( arg.details.headers ).toMatchObject( {
      authorization: '[REDACTED]',
      'x-custom': 'v'
    } );
  } );
} );

describe( 'http/hooks/trace_error (real fetch failures)', () => {
  beforeEach( () => {
    mockedTracing.addEventError.mockClear();
  } );

  it( 'records DOMException AbortError when the request is aborted (undici/fetch)', async () => {
    const client = kyWithTraceError();

    const controller = new AbortController();
    controller.abort();

    const rejected = client.get( REFUSED_URL, { signal: controller.signal } ).text();
    await expect( rejected ).rejects.toSatisfy(
      ( err: unknown ) => err instanceof DOMException && err.name === 'AbortError'
    );

    expect( mockedTracing.addEventError ).toHaveBeenCalledTimes( 1 );
    const arg = mockedTracing.addEventError.mock.calls[0][0] as { id: string; details: unknown };
    expect( arg.details ).toBeInstanceOf( DOMException );
    expect( ( arg.details as DOMException ).name ).toBe( 'AbortError' );
  } );

  it( 'records Ky NetworkError with undici ECONNREFUSED cause chain', async () => {
    const client = kyWithTraceError();

    await expect( client.get( REFUSED_URL ).text() ).rejects.toBeInstanceOf( NetworkError );

    expect( mockedTracing.addEventError ).toHaveBeenCalledTimes( 1 );
    const arg = mockedTracing.addEventError.mock.calls[0][0] as { id: string; details: NetworkError };
    expect( arg.details ).toBeInstanceOf( NetworkError );
    expect( arg.details.request.url ).toBe( REFUSED_URL );

    const undiciTypeError = arg.details.cause as TypeError | undefined;
    expect( undiciTypeError ).toBeInstanceOf( TypeError );
    expect( undiciTypeError?.message ).toBe( 'fetch failed' );

    const errno = undiciTypeError?.cause as NodeJS.ErrnoException | undefined;
    expect( errno ).toBeDefined();
    expect( errno!.code ).toBe( 'ECONNREFUSED' );
  } );
} );
