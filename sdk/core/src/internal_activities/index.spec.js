import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { FatalError } from '#errors';
import { serializeBodyAndInferContentType, serializeFetchResponse } from '#utils';
import { sendHttpRequest } from './index.js';

vi.mock( '#logger', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { createChildLogger: vi.fn( () => log ) };
} );

vi.mock( '#utils', () => ( {
  setMetadata: vi.fn(),
  isStringboolTrue: vi.fn( () => false ),
  serializeBodyAndInferContentType: vi.fn(),
  serializeFetchResponse: vi.fn()
} ) );

const mockAgent = new MockAgent();
mockAgent.disableNetConnect();

setGlobalDispatcher( mockAgent );

const url = 'https://growthx.ai';
const method = 'GET';

describe( 'internal_activities/sendHttpRequest', () => {
  beforeEach( async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  } );

  it( 'succeeds and returns serialized JSON response', async () => {
    const payload = { a: 1 };
    const method = 'POST';

    mockAgent.get( url ).intercept( { path: '/', method } )
      .reply( 200, JSON.stringify( { ok: true, value: 42 } ), {
        headers: { 'content-type': 'application/json' }
      } );

    // mock utils
    serializeBodyAndInferContentType.mockReturnValueOnce( {
      body: JSON.stringify( payload ),
      contentType: 'application/json; charset=UTF-8'
    } );
    const fakeSerialized = { sentinel: true };
    serializeFetchResponse.mockResolvedValueOnce( fakeSerialized );

    const result = await sendHttpRequest( { url, method, payload } );

    // utils mocked: verify calls and returned value
    expect( serializeBodyAndInferContentType ).toHaveBeenCalledTimes( 1 );
    expect( serializeBodyAndInferContentType ).toHaveBeenCalledWith( payload );
    expect( serializeFetchResponse ).toHaveBeenCalledTimes( 1 );
    const respArg = serializeFetchResponse.mock.calls[0][0];
    expect( respArg && typeof respArg.text ).toBe( 'function' );
    expect( respArg.status ).toBe( 200 );
    expect( respArg.headers.get( 'content-type' ) ).toContain( 'application/json' );
    expect( result ).toBe( fakeSerialized );
  } );

  it( 'throws FatalError when response.ok is false', async () => {
    mockAgent.get( url ).intercept( { path: '/', method } ).reply( 500, 'Internal error' );

    await expect( sendHttpRequest( { url, method } ) ).rejects
      .toThrow( new FatalError( 'GET https://growthx.ai 500' ) );
    expect( serializeFetchResponse ).not.toHaveBeenCalled();
    expect( serializeBodyAndInferContentType ).not.toHaveBeenCalled();
  } );

  it( 'throws FatalError on timeout failure', async () => {
    mockAgent.get( url ).intercept( { path: '/', method } )
      .reply( 200, 'ok', { headers: { 'content-type': 'text/plain' } } )
      .delay( 10_000 );

    await expect( sendHttpRequest( { url, method, timeout: 250 } ) ).rejects
      .toThrow( new FatalError( 'GET https://growthx.ai The operation was aborted due to timeout' ) );
    expect( serializeFetchResponse ).not.toHaveBeenCalled();
    expect( serializeBodyAndInferContentType ).not.toHaveBeenCalled();
  } );

  it( 'wraps DNS resolution errors (ENOTFOUND) preserving cause message', async () => {
    mockAgent.get( url ).intercept( { path: '/', method } )
      .replyWithError( new Error( 'getaddrinfo ENOTFOUND nonexistent.example.test' ) );

    await expect( sendHttpRequest( { url, method } ) ).rejects
      .toThrow( new FatalError( 'GET https://growthx.ai Error: getaddrinfo ENOTFOUND nonexistent.example.test' ) );
    expect( serializeFetchResponse ).not.toHaveBeenCalled();
    expect( serializeBodyAndInferContentType ).not.toHaveBeenCalled();
  } );

  it( 'wraps TCP connection errors (ECONNREFUSED) preserving cause message', async () => {
    mockAgent.get( url ).intercept( { path: '/', method } )
      .replyWithError( new Error( 'connect ECONNREFUSED 127.0.0.1:65500' ) );

    await expect( sendHttpRequest( { url, method } ) ).rejects
      .toThrow( new FatalError( 'GET https://growthx.ai Error: connect ECONNREFUSED 127.0.0.1:65500' ) );
    expect( serializeFetchResponse ).not.toHaveBeenCalled();
    expect( serializeBodyAndInferContentType ).not.toHaveBeenCalled();
  } );
} );
