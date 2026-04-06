import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BeforeErrorState, KyRequest, KyResponse, NormalizedOptions } from 'ky';
import { HTTPError } from 'ky';
import { traceError } from './trace_error.js';
import { Tracing } from '@outputai/core/sdk_activity_integration';

vi.mock( '../utils/index.js', () => ( {
  redactHeaders: vi.fn( ( h: Record<string, string> ) => h ),
  createTraceId: vi.fn( () => 'trace-id' )
} ) );

vi.mock( '@outputai/core/sdk_activity_integration', () => ( {
  Tracing: {
    addEventError: vi.fn()
  }
} ) );

const mockedTracing = vi.mocked( Tracing, true );

describe( 'http/hooks/trace_error', () => {
  beforeEach( () => {
    mockedTracing.addEventError.mockClear();
  } );

  it( 'traces error with response details when response exists', async () => {
    const request = new Request( 'https://api.example.com/users/1', { method: 'GET' } ) as KyRequest;
    const response = new Response( 'Unauthorized', {
      status: 401,
      statusText: 'Unauthorized',
      headers: { authorization: 'secret', 'x-custom': 'v' }
    } ) as KyResponse;

    const error = new HTTPError( response, request, {} as NormalizedOptions );

    const returned = await traceError( { error, request } as unknown as BeforeErrorState );

    expect( returned ).toBe( error );
    expect( mockedTracing.addEventError ).toHaveBeenCalledTimes( 1 );
    const arg = mockedTracing.addEventError.mock.calls[0][0] as { details: Record<string, unknown> };
    expect( arg.details.status ).toBe( 401 );
    expect( arg.details.statusText ).toBe( 'Unauthorized' );
    expect( arg.details.headers ).toMatchObject( { authorization: 'secret', 'x-custom': 'v' } );
  } );
} );
