import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Options } from 'ky';

const kyMocks = vi.hoisted( () => {
  const extend = vi.fn( ( options: Options = {} ) => ( { ...options } ) );
  const create = vi.fn( () => ( { extend } ) );
  return { create, extend };
} );

vi.mock( 'ky', () => ( {
  default: {
    create: kyMocks.create
  },
  HTTPError: class HTTPError extends Error {
    name = 'HTTPError';

    constructor( ..._args: unknown[] ) {
      super();
    }
  },
  TimeoutError: class TimeoutError extends Error {
    name = 'TimeoutError';

    constructor( ..._args: unknown[] ) {
      super();
    }
  }
} ) );

import { assignRequestId, traceRequest, traceResponse, traceError } from './hooks/index.js';
import { httpClient, HTTPError, TimeoutError } from './index.js';

describe( 'index / httpClient', () => {
  beforeEach( () => {
    kyMocks.extend.mockClear();
  } );

  it( 'registers Output tracing hooks on the base ky client', () => {
    expect( kyMocks.create ).toHaveBeenCalledTimes( 1 );
    const createArgs = kyMocks.create.mock.calls[0] as unknown as [Options];
    const opts = createArgs[0] as { hooks: Record<string, unknown> };
    expect( opts.hooks.beforeRequest ).toEqual( [ assignRequestId, traceRequest ] );
    expect( opts.hooks.afterResponse ).toEqual( [ traceResponse ] );
    expect( opts.hooks.beforeError ).toEqual( [ traceError ] );
  } );

  it( 'httpClient forwards options to ky extend', () => {
    const options: Options = {
      prefix: 'https://api.example.com',
      timeout: 5000
    };
    const client = httpClient( options );

    expect( kyMocks.extend ).toHaveBeenCalledTimes( 1 );
    expect( kyMocks.extend ).toHaveBeenCalledWith( options );
    expect( client ).toEqual( options );
  } );

  it( 'httpClient uses empty options by default', () => {
    httpClient();

    expect( kyMocks.extend ).toHaveBeenCalledWith( {} );
  } );

  it( 're-exports HTTPError and TimeoutError from ky', () => {
    const HttpErr = HTTPError as unknown as new () => Error;
    const TimeErr = TimeoutError as unknown as new () => Error;
    expect( new HttpErr() ).toBeInstanceOf( Error );
    expect( new HttpErr().name ).toBe( 'HTTPError' );
    expect( new TimeErr() ).toBeInstanceOf( Error );
    expect( new TimeErr().name ).toBe( 'TimeoutError' );
  } );
} );
