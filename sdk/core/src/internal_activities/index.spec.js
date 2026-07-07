import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FatalError } from '#errors';
import { ACTIVITY_GET_TRACE_DESTINATIONS, ACTIVITY_SEND_HTTP_REQUEST } from '#consts';
import { serializeBodyAndInferContentType, serializeResponse } from '#helpers/fetch';
import { getTraceDestinations, sendHttpRequest } from './index.js';

const getDestinationsMock = vi.hoisted( () => vi.fn() );
const createInternalStepMock = vi.hoisted( () => vi.fn( ( { handler } ) => handler ) );
const fetchMock = vi.hoisted( () => vi.fn() );
const EnvHttpProxyAgentMock = vi.hoisted( () => vi.fn( function EnvHttpProxyAgent( options ) {
  this.options = options;
} ) );

vi.mock( 'undici', () => ( {
  EnvHttpProxyAgent: EnvHttpProxyAgentMock,
  fetch: fetchMock
} ) );

vi.mock( '#tracing', () => ( {
  getDestinations: getDestinationsMock
} ) );

vi.mock( '#logger', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { createChildLogger: vi.fn( () => log ) };
} );

vi.mock( '#helpers/component', () => ( {
  createInternalStep: createInternalStepMock
} ) );

vi.mock( '#helpers/string', () => ( {
  isStringboolTrue: vi.fn( () => false )
} ) );

vi.mock( '#helpers/fetch', () => ( {
  hydrateHeaders: vi.fn( headers => headers ?? {} ),
  serializeBodyAndInferContentType: vi.fn(),
  serializeResponse: vi.fn()
} ) );

const url = 'https://growthx.ai';
const method = 'GET';

const response = ( { ok = true, status = 200, statusText = 'OK', headers = {} } = {} ) => ( {
  ok,
  status,
  statusText,
  headers: new Headers( headers ),
  text: vi.fn()
} );

describe( 'internal_activities component registration', () => {
  it( 'creates internal step components for exported activities', () => {
    expect( EnvHttpProxyAgentMock ).toHaveBeenCalledWith( { allowH2: false } );
    expect( createInternalStepMock ).toHaveBeenNthCalledWith( 1, {
      name: ACTIVITY_SEND_HTTP_REQUEST,
      handler: expect.any( Function )
    } );
    expect( createInternalStepMock ).toHaveBeenNthCalledWith( 2, {
      name: ACTIVITY_GET_TRACE_DESTINATIONS,
      handler: expect.any( Function )
    } );
    expect( sendHttpRequest ).toBe( createInternalStepMock.mock.calls[0][0].handler );
    expect( getTraceDestinations ).toBe( createInternalStepMock.mock.calls[1][0].handler );
  } );
} );

describe( 'internal_activities/sendHttpRequest', () => {
  beforeEach( async () => {
    fetchMock.mockReset();
    serializeBodyAndInferContentType.mockReset();
    serializeResponse.mockReset();
  } );

  it( 'succeeds and returns serialized JSON response', async () => {
    const payload = { a: 1 };
    const method = 'POST';

    fetchMock.mockResolvedValueOnce( response( {
      status: 200,
      headers: { 'content-type': 'application/json' }
    } ) );

    // mock utils
    serializeBodyAndInferContentType.mockReturnValueOnce( {
      body: JSON.stringify( payload ),
      contentType: 'application/json; charset=UTF-8'
    } );
    const fakeSerialized = { sentinel: true };
    serializeResponse.mockResolvedValueOnce( fakeSerialized );

    const result = await sendHttpRequest( { url, method, payload } );

    // utils mocked: verify calls and returned value
    expect( serializeBodyAndInferContentType ).toHaveBeenCalledTimes( 1 );
    expect( serializeBodyAndInferContentType ).toHaveBeenCalledWith( payload );
    expect( fetchMock ).toHaveBeenCalledWith( url, expect.objectContaining( {
      method,
      dispatcher: expect.any( EnvHttpProxyAgentMock )
    } ) );
    expect( serializeResponse ).toHaveBeenCalledTimes( 1 );
    const respArg = serializeResponse.mock.calls[0][0];
    expect( respArg && typeof respArg.text ).toBe( 'function' );
    expect( respArg.status ).toBe( 200 );
    expect( respArg.headers.get( 'content-type' ) ).toContain( 'application/json' );
    expect( serializeResponse.mock.calls[0][1] ).toEqual( {} );
    expect( result ).toBe( fakeSerialized );
  } );

  it( 'passes response options to response serialization', async () => {
    const responseOptions = { includeHeaders: true, includeBody: true };
    const fakeSerialized = { sentinel: true };

    fetchMock.mockResolvedValueOnce( response( { status: 200 } ) );
    serializeResponse.mockResolvedValueOnce( fakeSerialized );

    const result = await sendHttpRequest( { url, method, responseOptions } );

    expect( serializeResponse ).toHaveBeenCalledTimes( 1 );
    expect( serializeResponse.mock.calls[0][1] ).toBe( responseOptions );
    expect( result ).toBe( fakeSerialized );
  } );

  it( 'throws FatalError when response.ok is false', async () => {
    fetchMock.mockResolvedValueOnce( response( { ok: false, status: 500, statusText: 'Internal Server Error' } ) );

    await expect( sendHttpRequest( { url, method } ) ).rejects
      .toThrow( new FatalError( 'GET https://growthx.ai 500' ) );
    expect( serializeResponse ).not.toHaveBeenCalled();
    expect( serializeBodyAndInferContentType ).not.toHaveBeenCalled();
  } );

  it( 'throws FatalError on timeout failure', async () => {
    fetchMock.mockRejectedValueOnce( new Error( 'The operation was aborted due to timeout' ) );

    await expect( sendHttpRequest( { url, method, timeout: 250 } ) ).rejects
      .toThrow( new FatalError( 'GET https://growthx.ai The operation was aborted due to timeout' ) );
    expect( serializeResponse ).not.toHaveBeenCalled();
    expect( serializeBodyAndInferContentType ).not.toHaveBeenCalled();
  } );

  it( 'wraps DNS resolution errors (ENOTFOUND) preserving cause message', async () => {
    fetchMock.mockRejectedValueOnce(
      Object.assign( new Error( 'fetch failed' ), { cause: new Error( 'getaddrinfo ENOTFOUND nonexistent.example.test' ) } )
    );

    await expect( sendHttpRequest( { url, method } ) ).rejects
      .toThrow( new FatalError( 'GET https://growthx.ai Error: getaddrinfo ENOTFOUND nonexistent.example.test' ) );
    expect( serializeResponse ).not.toHaveBeenCalled();
    expect( serializeBodyAndInferContentType ).not.toHaveBeenCalled();
  } );

  it( 'wraps TCP connection errors (ECONNREFUSED) preserving cause message', async () => {
    fetchMock.mockRejectedValueOnce(
      Object.assign( new Error( 'fetch failed' ), { cause: new Error( 'connect ECONNREFUSED 127.0.0.1:65500' ) } )
    );

    await expect( sendHttpRequest( { url, method } ) ).rejects
      .toThrow( new FatalError( 'GET https://growthx.ai Error: connect ECONNREFUSED 127.0.0.1:65500' ) );
    expect( serializeResponse ).not.toHaveBeenCalled();
    expect( serializeBodyAndInferContentType ).not.toHaveBeenCalled();
  } );
} );

describe( 'internal_activities/getTraceDestinations', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'returns trace destinations for the given traceInfo', () => {
    const traceInfo = {
      workflowId: 'workflow-id',
      runId: 'run-id',
      workflowType: 'workflow',
      startTime: Date.parse( '2026-06-02T09:00:00.000Z' )
    };
    const destinations = {
      local: '/tmp/project/logs/runs/workflow/trace.json'
    };
    getDestinationsMock.mockReturnValueOnce( destinations );

    expect( getTraceDestinations( traceInfo ) ).toBe( destinations );
    expect( getDestinationsMock ).toHaveBeenCalledWith( traceInfo );
  } );
} );
