import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getGlobalDispatcher, MockAgent, Request, setGlobalDispatcher } from 'undici';

const FIXED_REQUEST_ID = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';

const randomUUIDMock = vi.hoisted( () => vi.fn( () => FIXED_REQUEST_ID ) );

vi.mock( 'node:crypto', () => ( {
  randomUUID: ( ...args ) => randomUUIDMock( ...args )
} ) );

vi.mock( '@outputai/core/sdk_activity_integration', () => ( {
  Tracing: {
    addEventStart: vi.fn(),
    addEventEnd: vi.fn(),
    addEventError: vi.fn()
  }
} ) );

import { Tracing } from '@outputai/core/sdk_activity_integration';
import { fetch } from './index.js';

const tracing = vi.mocked( Tracing, true );

const MOCK_ORIGIN = 'https://http2-index.undici.test';

describe( 'http2/index', () => {
  const undiciCtx = {
    mockAgent: undefined,
    previousDispatcher: undefined
  };

  beforeEach( () => {
    undiciCtx.mockAgent = new MockAgent();
    undiciCtx.mockAgent.disableNetConnect();
    undiciCtx.previousDispatcher = getGlobalDispatcher();
    setGlobalDispatcher( undiciCtx.mockAgent );
    tracing.addEventStart.mockClear();
    tracing.addEventEnd.mockClear();
    tracing.addEventError.mockClear();
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
      undiciCtx.mockAgent.get( MOCK_ORIGIN ).intercept( { path: '/ok', method: 'GET' } ).reply(
        200,
        'hello',
        { headers: { 'content-type': 'text/plain' } }
      );

      const response = await fetch( `${MOCK_ORIGIN}/ok` );

      expect( response.status ).toBe( 200 );
      expect( await response.text() ).toBe( 'hello' );

      expect( tracing.addEventStart ).toHaveBeenCalledTimes( 1 );
      expect( tracing.addEventStart ).toHaveBeenCalledWith( {
        id: FIXED_REQUEST_ID,
        kind: 'http',
        name: 'request',
        details: {
          method: 'GET',
          url: `${MOCK_ORIGIN}/ok`
        }
      } );
      expect( tracing.addEventEnd ).toHaveBeenCalledTimes( 1 );
      expect( tracing.addEventEnd.mock.calls[0][0].id ).toBe( FIXED_REQUEST_ID );
      expect( tracing.addEventError ).not.toHaveBeenCalled();
    } );

    it( 'uses logError for status > 399 without logging response end', async () => {
      undiciCtx.mockAgent.get( MOCK_ORIGIN ).intercept( { path: '/missing', method: 'GET' } ).reply(
        404,
        'nope',
        { headers: { 'content-type': 'text/plain' } }
      );

      const response = await fetch( `${MOCK_ORIGIN}/missing` );

      expect( response.status ).toBe( 404 );

      expect( tracing.addEventStart ).toHaveBeenCalledTimes( 1 );
      expect( tracing.addEventEnd ).not.toHaveBeenCalled();
      expect( tracing.addEventError ).toHaveBeenCalledTimes( 1 );
      expect( tracing.addEventError.mock.calls[0][0].id ).toBe( FIXED_REQUEST_ID );
      expect( tracing.addEventError.mock.calls[0][0].details ).toMatchObject( {
        status: 404,
        statusText: 'Not Found'
      } );
      expect( tracing.addEventError.mock.calls[0][0].details.headers ).toEqual( {
        'content-type': 'text/plain'
      } );
    } );

    it( 'treats status 399 as success (logs response end, not HTTP error)', async () => {
      undiciCtx.mockAgent.get( MOCK_ORIGIN ).intercept( { path: '/edge', method: 'GET' } ).reply(
        399,
        '',
        { statusText: 'Client Closed Request', headers: { 'content-type': 'text/plain' } }
      );

      const response = await fetch( `${MOCK_ORIGIN}/edge` );

      expect( response.status ).toBe( 399 );
      expect( tracing.addEventEnd ).toHaveBeenCalledTimes( 1 );
      expect( tracing.addEventError ).not.toHaveBeenCalled();
    } );

    it( 'sends x-request-id and custom headers when init.headers is a plain object', async () => {
      undiciCtx.mockAgent.get( MOCK_ORIGIN ).intercept( {
        path: '/with-plain-headers',
        method: 'GET',
        headers: {
          'x-request-id': FIXED_REQUEST_ID,
          'x-custom': 'plain-value'
        }
      } ).reply( 200, 'ok' );

      const response = await fetch( `${MOCK_ORIGIN}/with-plain-headers`, {
        headers: { 'X-Custom': 'plain-value' }
      } );

      expect( response.status ).toBe( 200 );
    } );

    it( 'sends x-request-id and custom headers when init.headers is a Headers instance', async () => {
      undiciCtx.mockAgent.get( MOCK_ORIGIN ).intercept( {
        path: '/with-headers-instance',
        method: 'GET',
        headers: {
          'x-request-id': FIXED_REQUEST_ID,
          'x-from-headers': 'yes'
        }
      } ).reply( 200, 'ok' );

      const userHeaders = new Headers();
      userHeaders.set( 'X-From-Headers', 'yes' );

      const response = await fetch( `${MOCK_ORIGIN}/with-headers-instance`, {
        headers: userHeaders
      } );

      expect( response.status ).toBe( 200 );
    } );

    it( 'calls logFailure when the mock responds with replyWithError', async () => {
      undiciCtx.mockAgent.get( MOCK_ORIGIN ).intercept( { path: '/boom', method: 'GET' } ).replyWithError(
        new Error( 'simulated network failure' )
      );

      await expect( fetch( `${MOCK_ORIGIN}/boom` ) ).rejects.toThrow( 'fetch failed' );

      expect( tracing.addEventStart ).toHaveBeenCalledTimes( 1 );
      expect( tracing.addEventEnd ).not.toHaveBeenCalled();
      expect( tracing.addEventError ).toHaveBeenCalledTimes( 1 );
      expect( tracing.addEventError.mock.calls[0][0].id ).toBe( FIXED_REQUEST_ID );
      const failure = tracing.addEventError.mock.calls[0][0].details;
      expect( failure ).toBeInstanceOf( TypeError );
      expect( failure.message ).toBe( 'fetch failed' );
      expect( failure.cause ).toBeInstanceOf( Error );
      expect( failure.cause.message ).toBe( 'simulated network failure' );
    } );

    it( 'fails when no mock matches (disabled net)', async () => {
      await expect( fetch( `${MOCK_ORIGIN}/unmocked` ) ).rejects.toThrow();

      expect( tracing.addEventStart ).toHaveBeenCalledTimes( 1 );
      expect( tracing.addEventEnd ).not.toHaveBeenCalled();
      expect( tracing.addEventError ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'passes method and body through to undici for POST JSON', async () => {
      undiciCtx.mockAgent.get( MOCK_ORIGIN ).intercept( { path: '/create', method: 'POST' } ).reply(
        201,
        JSON.stringify( { id: 1 } ),
        { headers: { 'content-type': 'application/json' } }
      );

      const response = await fetch( `${MOCK_ORIGIN}/create`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify( { name: 'a' } )
      } );

      expect( response.status ).toBe( 201 );
      expect( tracing.addEventStart.mock.calls[0][0].details.method ).toBe( 'POST' );
      expect( tracing.addEventEnd ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'works when the second argument is omitted', async () => {
      undiciCtx.mockAgent.get( MOCK_ORIGIN ).intercept( { path: '/bare', method: 'GET' } ).reply( 204 );

      const response = await fetch( `${MOCK_ORIGIN}/bare` );

      expect( response.status ).toBe( 204 );
      expect( tracing.addEventStart.mock.calls[0][0].details.method ).toBe( 'GET' );
    } );
  } );

  describe( 'fetch RequestInfo / RequestInit shapes', () => {
    it( 'accepts a URL object as the first argument', async () => {
      undiciCtx.mockAgent.get( MOCK_ORIGIN ).intercept( { path: '/from-url', method: 'GET' } ).reply(
        200,
        'url-ok',
        { headers: { 'content-type': 'text/plain' } }
      );

      const href = new URL( '/from-url', `${MOCK_ORIGIN}/` );
      const response = await fetch( href );

      expect( response.status ).toBe( 200 );
      expect( await response.text() ).toBe( 'url-ok' );
      expect( tracing.addEventStart.mock.calls[0][0].details.url ).toBe( href.href );
    } );

    it( 'accepts a Request as the first argument (no init)', async () => {
      undiciCtx.mockAgent.get( MOCK_ORIGIN ).intercept( { path: '/req-only', method: 'GET' } ).reply( 200, 'r1' );

      const input = new Request( `${MOCK_ORIGIN}/req-only`, { method: 'GET' } );
      const response = await fetch( input );

      expect( response.status ).toBe( 200 );
      expect( await response.text() ).toBe( 'r1' );
      expect( tracing.addEventStart.mock.calls[0][0].details ).toMatchObject( {
        method: 'GET',
        url: `${MOCK_ORIGIN}/req-only`
      } );
    } );

    it( 'accepts Request plus init that overrides method and body', async () => {
      undiciCtx.mockAgent.get( MOCK_ORIGIN ).intercept( { path: '/req-plus-init', method: 'POST' } ).reply(
        201,
        JSON.stringify( { saved: true } ),
        { headers: { 'content-type': 'application/json' } }
      );

      const input = new Request( `${MOCK_ORIGIN}/req-plus-init`, { method: 'GET' } );
      const response = await fetch( input, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify( { name: 'override' } )
      } );

      expect( response.status ).toBe( 201 );
      expect( tracing.addEventStart.mock.calls[0][0].details.method ).toBe( 'POST' );
      expect( tracing.addEventEnd ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'accepts string URL with explicit undefined init', async () => {
      undiciCtx.mockAgent.get( MOCK_ORIGIN ).intercept( { path: '/explicit-undefined', method: 'GET' } ).reply( 200, 'ok' );

      const response = await fetch( `${MOCK_ORIGIN}/explicit-undefined`, undefined );

      expect( response.status ).toBe( 200 );
      expect( tracing.addEventStart.mock.calls[0][0].details.method ).toBe( 'GET' );
    } );

    it( 'accepts URL plus init with method and headers', async () => {
      undiciCtx.mockAgent.get( MOCK_ORIGIN ).intercept( {
        path: '/url-post',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': FIXED_REQUEST_ID }
      } ).reply( 200, '{}' );

      const href = new URL( '/url-post', `${MOCK_ORIGIN}/` );
      const response = await fetch( href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      } );

      expect( response.status ).toBe( 200 );
      expect( tracing.addEventStart.mock.calls[0][0].details.method ).toBe( 'POST' );
    } );
  } );
} );
