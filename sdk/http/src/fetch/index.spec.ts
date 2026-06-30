import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getGlobalDispatcher, Headers, MockAgent, Request, setGlobalDispatcher } from 'undici';
import type { Dispatcher, Request as UndiciRequest, Response as UndiciResponse } from 'undici';

const FIXED_REQUEST_ID = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';

const randomUUIDMock = vi.hoisted( () => vi.fn( () => FIXED_REQUEST_ID ) );

const loggerMock = vi.hoisted( () => ( {
  logRequest: vi.fn( async ( _args: { requestId: string; request: UndiciRequest } ): Promise<void> => {} ),
  logResponse: vi.fn( async ( _args: {
    requestId: string; response: UndiciResponse; method: string; url: string; durationMs: number;
  } ): Promise<void> => {} ),
  logError: vi.fn( ( _args: {
    requestId: string; response: UndiciResponse; method: string; url: string; durationMs: number;
  } ): void => {} ),
  logFailure: vi.fn( ( _args: {
    requestId: string; error: Error; method: string; url: string; durationMs: number;
  } ): void => {} )
} ) );
const utilsMock = vi.hoisted( () => ( {
  addRequestIdToResponse: vi.fn()
} ) );

vi.mock( 'node:crypto', () => ( {
  randomUUID: () => randomUUIDMock()
} ) );

vi.mock( './logger.js', () => ( {
  logRequest: loggerMock.logRequest,
  logResponse: loggerMock.logResponse,
  logError: loggerMock.logError,
  logFailure: loggerMock.logFailure
} ) );
vi.mock( './utils.js', () => ( {
  addRequestIdToResponse: utilsMock.addRequestIdToResponse
} ) );

import { fetch } from './index.js';

const MOCK_ORIGIN = 'https://fetch-index.undici.test';

describe( 'fetch/index', () => {
  const undiciCtx: {
    mockAgent: MockAgent | undefined;
    previousDispatcher: Dispatcher | undefined;
  } = {
    mockAgent: undefined,
    previousDispatcher: undefined
  };

  const fetchWithMockDispatcher = (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => fetch( input, { ...init, dispatcher: undiciCtx.mockAgent! } );

  beforeEach( () => {
    undiciCtx.mockAgent = new MockAgent();
    undiciCtx.mockAgent.disableNetConnect();
    undiciCtx.previousDispatcher = getGlobalDispatcher();
    setGlobalDispatcher( undiciCtx.mockAgent );
    loggerMock.logRequest.mockClear();
    loggerMock.logResponse.mockClear();
    loggerMock.logError.mockClear();
    loggerMock.logFailure.mockClear();
    utilsMock.addRequestIdToResponse.mockClear();
    randomUUIDMock.mockClear();
    randomUUIDMock.mockImplementation( () => FIXED_REQUEST_ID );
  } );

  afterEach( async () => {
    if ( undiciCtx.previousDispatcher !== undefined ) {
      setGlobalDispatcher( undiciCtx.previousDispatcher );
    }
    if ( undiciCtx.mockAgent !== undefined ) {
      await undiciCtx.mockAgent.close();
    }
  } );

  describe( 'fetch with MockAgent', () => {
    it( 'returns 200, traces request start and response end', async () => {
      undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( { path: '/ok', method: 'GET' } ).reply(
        200,
        'hello',
        { headers: { 'content-type': 'text/plain' } }
      );

      const response = await fetchWithMockDispatcher( `${MOCK_ORIGIN}/ok` );

      expect( response.status ).toBe( 200 );
      expect( await response.text() ).toBe( 'hello' );

      expect( loggerMock.logRequest ).toHaveBeenCalledTimes( 1 );
      expect( loggerMock.logRequest.mock.calls[0][0].requestId ).toBe( FIXED_REQUEST_ID );
      expect( loggerMock.logRequest.mock.calls[0][0].request.method ).toBe( 'GET' );
      expect( loggerMock.logRequest.mock.calls[0][0].request.url ).toBe( `${MOCK_ORIGIN}/ok` );

      expect( loggerMock.logResponse ).toHaveBeenCalledTimes( 1 );
      const responseCall = loggerMock.logResponse.mock.calls[0][0];
      expect( responseCall.requestId ).toBe( FIXED_REQUEST_ID );
      expect( responseCall.response ).toBe( response );
      expect( responseCall.method ).toBe( 'GET' );
      expect( responseCall.url ).toBe( `${MOCK_ORIGIN}/ok` );
      expect( typeof responseCall.durationMs ).toBe( 'number' );
      expect( responseCall.durationMs ).toBeGreaterThanOrEqual( 0 );
      expect( utilsMock.addRequestIdToResponse ).toHaveBeenCalledTimes( 1 );
      expect( utilsMock.addRequestIdToResponse ).toHaveBeenCalledWith( response, FIXED_REQUEST_ID );

      expect( loggerMock.logError ).not.toHaveBeenCalled();
      expect( loggerMock.logFailure ).not.toHaveBeenCalled();
    } );

    it( 'uses logError for status > 399 without logging response end', async () => {
      undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( { path: '/missing', method: 'GET' } ).reply(
        404,
        'nope',
        { headers: { 'content-type': 'text/plain' } }
      );

      const response = await fetchWithMockDispatcher( `${MOCK_ORIGIN}/missing` );

      expect( response.status ).toBe( 404 );

      expect( loggerMock.logRequest ).toHaveBeenCalledTimes( 1 );
      expect( loggerMock.logResponse ).not.toHaveBeenCalled();
      expect( loggerMock.logError ).toHaveBeenCalledTimes( 1 );
      expect( loggerMock.logError.mock.calls[0][0].requestId ).toBe( FIXED_REQUEST_ID );
      expect( loggerMock.logError.mock.calls[0][0].response ).toBe( response );
      expect( utilsMock.addRequestIdToResponse ).toHaveBeenCalledTimes( 1 );
      expect( utilsMock.addRequestIdToResponse ).toHaveBeenCalledWith( response, FIXED_REQUEST_ID );
    } );

    it( 'treats status 399 as success (logs response end, not HTTP error)', async () => {
      undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( { path: '/edge', method: 'GET' } ).reply(
        399,
        '',
        { headers: { 'content-type': 'text/plain' } }
      );

      const response = await fetchWithMockDispatcher( `${MOCK_ORIGIN}/edge` );

      expect( response.status ).toBe( 399 );
      expect( loggerMock.logResponse ).toHaveBeenCalledTimes( 1 );
      expect( loggerMock.logError ).not.toHaveBeenCalled();
    } );

    it( 'sends x-request-trace-id and custom headers when init.headers is a plain object', async () => {
      undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( {
        path: '/with-plain-headers',
        method: 'GET',
        headers: {
          'x-request-trace-id': FIXED_REQUEST_ID,
          'x-custom': 'plain-value'
        }
      } ).reply( 200, 'ok' );

      const response = await fetchWithMockDispatcher( `${MOCK_ORIGIN}/with-plain-headers`, {
        headers: { 'X-Custom': 'plain-value' }
      } );

      expect( response.status ).toBe( 200 );
      const { request } = loggerMock.logRequest.mock.calls[0][0];
      expect( request.headers.get( 'x-request-trace-id' ) ).toBe( FIXED_REQUEST_ID );
      expect( request.headers.get( 'x-custom' ) ).toBe( 'plain-value' );
    } );

    it( 'sends x-request-trace-id and custom headers when init.headers is a Headers instance', async () => {
      undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( {
        path: '/with-headers-instance',
        method: 'GET',
        headers: {
          'x-request-trace-id': FIXED_REQUEST_ID,
          'x-from-headers': 'yes'
        }
      } ).reply( 200, 'ok' );

      const userHeaders = new Headers();
      userHeaders.set( 'X-From-Headers', 'yes' );

      const response = await fetchWithMockDispatcher( `${MOCK_ORIGIN}/with-headers-instance`, {
        headers: userHeaders
      } );

      expect( response.status ).toBe( 200 );
      const { request } = loggerMock.logRequest.mock.calls[0][0];
      expect( request.headers.get( 'x-request-trace-id' ) ).toBe( FIXED_REQUEST_ID );
      expect( request.headers.get( 'x-from-headers' ) ).toBe( 'yes' );
    } );

    it( 'calls logFailure when the mock responds with replyWithError', async () => {
      undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( { path: '/boom', method: 'GET' } ).replyWithError(
        new Error( 'simulated network failure' )
      );

      await expect( fetchWithMockDispatcher( `${MOCK_ORIGIN}/boom` ) ).rejects.toThrow( 'fetch failed' );

      expect( loggerMock.logRequest ).toHaveBeenCalledTimes( 1 );
      expect( loggerMock.logResponse ).not.toHaveBeenCalled();
      expect( loggerMock.logFailure ).toHaveBeenCalledTimes( 1 );
      expect( loggerMock.logFailure.mock.calls[0][0].requestId ).toBe( FIXED_REQUEST_ID );
      const failure = loggerMock.logFailure.mock.calls[0][0].error;
      expect( failure ).toBeInstanceOf( TypeError );
      expect( ( failure as TypeError ).message ).toBe( 'fetch failed' );
      expect( ( failure as TypeError ).cause ).toBeInstanceOf( Error );
      expect( ( ( failure as TypeError ).cause as Error ).message ).toBe( 'simulated network failure' );
    } );

    it( 'fails when no mock matches (disabled net)', async () => {
      await expect( fetchWithMockDispatcher( `${MOCK_ORIGIN}/unmocked` ) ).rejects.toThrow();

      expect( loggerMock.logRequest ).toHaveBeenCalledTimes( 1 );
      expect( loggerMock.logResponse ).not.toHaveBeenCalled();
      expect( loggerMock.logFailure ).toHaveBeenCalledTimes( 1 );
      expect( utilsMock.addRequestIdToResponse ).not.toHaveBeenCalled();
    } );

    it( 'passes method and body through to undici for POST JSON', async () => {
      undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( { path: '/create', method: 'POST' } ).reply(
        201,
        JSON.stringify( { id: 1 } ),
        { headers: { 'content-type': 'application/json' } }
      );

      const response = await fetchWithMockDispatcher( `${MOCK_ORIGIN}/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify( { name: 'a' } )
      } );

      expect( response.status ).toBe( 201 );
      expect( loggerMock.logRequest.mock.calls[0][0].request.method ).toBe( 'POST' );
      expect( loggerMock.logResponse ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'works when the second argument is omitted', async () => {
      undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( { path: '/bare', method: 'GET' } ).reply( 204 );

      const response = await fetchWithMockDispatcher( `${MOCK_ORIGIN}/bare` );

      expect( response.status ).toBe( 204 );
      expect( loggerMock.logRequest.mock.calls[0][0].request.method ).toBe( 'GET' );
    } );
  } );

  describe( 'fetch RequestInfo / RequestInit shapes', () => {
    it( 'accepts a URL object as the first argument', async () => {
      undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( { path: '/from-url', method: 'GET' } ).reply(
        200,
        'url-ok',
        { headers: { 'content-type': 'text/plain' } }
      );

      const href = new URL( '/from-url', `${MOCK_ORIGIN}/` );
      const response = await fetchWithMockDispatcher( href );

      expect( response.status ).toBe( 200 );
      expect( await response.text() ).toBe( 'url-ok' );
      expect( loggerMock.logRequest.mock.calls[0][0].request.url ).toBe( href.href );
    } );

    it( 'accepts a Request as the first argument (no init)', async () => {
      undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( { path: '/req-only', method: 'GET' } ).reply( 200, 'r1' );

      const input = new Request( `${MOCK_ORIGIN}/req-only`, { method: 'GET' } );
      const response = await fetchWithMockDispatcher( input );

      expect( response.status ).toBe( 200 );
      expect( await response.text() ).toBe( 'r1' );
      const { request } = loggerMock.logRequest.mock.calls[0][0];
      expect( request.method ).toBe( 'GET' );
      expect( request.url ).toBe( `${MOCK_ORIGIN}/req-only` );
    } );

    it( 'accepts Request plus init that overrides method and body', async () => {
      undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( { path: '/req-plus-init', method: 'POST' } ).reply(
        201,
        JSON.stringify( { saved: true } ),
        { headers: { 'content-type': 'application/json' } }
      );

      const input = new Request( `${MOCK_ORIGIN}/req-plus-init`, { method: 'GET' } );
      const response = await fetchWithMockDispatcher( input, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify( { name: 'override' } )
      } );

      expect( response.status ).toBe( 201 );
      expect( loggerMock.logRequest.mock.calls[0][0].request.method ).toBe( 'POST' );
      expect( loggerMock.logResponse ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'accepts string URL with explicit undefined init', async () => {
      undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( { path: '/explicit-undefined', method: 'GET' } ).reply( 200, 'ok' );

      const response = await fetchWithMockDispatcher( `${MOCK_ORIGIN}/explicit-undefined`, undefined );

      expect( response.status ).toBe( 200 );
      expect( loggerMock.logRequest.mock.calls[0][0].request.method ).toBe( 'GET' );
    } );

    it( 'accepts URL plus init with method and headers', async () => {
      undiciCtx.mockAgent!.get( MOCK_ORIGIN ).intercept( {
        path: '/url-post',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-trace-id': FIXED_REQUEST_ID }
      } ).reply( 200, '{}' );

      const href = new URL( '/url-post', `${MOCK_ORIGIN}/` );
      const response = await fetchWithMockDispatcher( href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      } );

      expect( response.status ).toBe( 200 );
      expect( loggerMock.logRequest.mock.calls[0][0].request.method ).toBe( 'POST' );
    } );

    it( 'uses caller-provided dispatcher without dropping init request options', async () => {
      const dispatcher = new MockAgent();
      dispatcher.disableNetConnect();
      dispatcher.get( MOCK_ORIGIN ).intercept( {
        path: '/custom-dispatcher',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-trace-id': FIXED_REQUEST_ID,
          'x-custom': 'custom-value'
        }
      } ).reply( 200, 'ok' );

      const response = await fetch( `${MOCK_ORIGIN}/custom-dispatcher`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Custom': 'custom-value'
        },
        body: '{}',
        dispatcher
      } );

      expect( response.status ).toBe( 200 );
      expect( await response.text() ).toBe( 'ok' );
      expect( loggerMock.logRequest.mock.calls[0][0].request.method ).toBe( 'POST' );
      expect( loggerMock.logResponse ).toHaveBeenCalledTimes( 1 );

      await dispatcher.close();
    } );
  } );
} );
