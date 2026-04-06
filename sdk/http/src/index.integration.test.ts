import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ky from 'ky';
import { httpClient } from './index.js';
import { Tracing } from '@outputai/core/sdk_activity_integration';
import createTraceId from './utils/create_trace_id.js';
import { traceRequest, traceResponse, traceError } from './hooks/index.js';

// Helper function for trace ID format validation
const isUuidFormat = ( traceId: string ): boolean => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test( traceId );
};

vi.mock( '@outputai/core/sdk_activity_integration', () => ( {
  Tracing: {
    addEventStart: vi.fn(),
    addEventEnd: vi.fn(),
    addEventError: vi.fn()
  }
} ) );

const mockedTracing = vi.mocked( Tracing, true );

interface HttpBinResponse {
  headers: Record<string, string | string[]>;
  url: string;
  method: string;
  args: Record<string, string>;
  origin: string;
  json?: unknown;
}

// Helper to get header value (httpbingo returns arrays)
const getHeader = ( headers: Record<string, string | string[]>, key: string ): string | undefined => {
  const value = headers[key];
  return Array.isArray( value ) ? value[0] : value;
};

describe( 'HTTP Client Authentication Integration', () => {
  const httpBinClient = httpClient( {
    prefix: 'https://httpbingo.org',
    timeout: 5000
  } );

  const clientsClient = httpBinClient.extend( {
    headers: {
      'X-API-Key': 'demo-api-key-12345'
    }
  } );

  const contractsClient = httpBinClient.extend( {
    headers: {
      Authorization: `Basic ${Buffer.from( 'demo-user:demo-pass' ).toString( 'base64' )}`
    }
  } );

  describe( 'Authentication Headers', () => {
    it( 'should include API key for clients endpoints', async () => {
      const response = await clientsClient.get( 'anything/clients' );
      const data = await response.json() as HttpBinResponse;

      expect( getHeader( data.headers, 'X-Api-Key' ) ).toBe( 'demo-api-key-12345' );
      expect( data.url ).toContain( '/anything/clients' );
      expect( data.method ).toBe( 'GET' );
    }, 10000 );

    it( 'should include Basic auth for contracts endpoints', async () => {
      const response = await contractsClient.get( 'anything/contracts' );
      const data = await response.json() as HttpBinResponse;

      const authHeader = getHeader( data.headers, 'Authorization' );
      expect( authHeader ).toMatch( /^Basic / );
      expect( authHeader ).toBe( `Basic ${Buffer.from( 'demo-user:demo-pass' ).toString( 'base64' )}` );
      expect( data.url ).toContain( '/anything/contracts' );
    }, 10000 );

    it( 'should remove auth headers when overridden with undefined', async () => {
      const response = await clientsClient.get( 'anything/clients/export', {
        headers: { 'X-API-Key': undefined }
      } );
      const data = await response.json() as HttpBinResponse;

      expect( getHeader( data.headers, 'X-Api-Key' ) ).toBeUndefined();
      expect( data.url ).toContain( '/anything/clients/export' );
    }, 10000 );

    it( 'should properly handle POST with JSON data and authentication', async () => {
      const testData = { name: 'Test Client', email: 'test@example.com' };
      const response = await clientsClient.post( 'anything/clients', { json: testData } );
      const data = await response.json() as HttpBinResponse;

      expect( getHeader( data.headers, 'X-Api-Key' ) ).toBe( 'demo-api-key-12345' );
      expect( data.json ).toEqual( testData );
      expect( data.method ).toBe( 'POST' );
    }, 10000 );
  } );

  describe( 'URL Path Construction', () => {
    it( 'should correctly build URLs with chained prefix', async () => {
      const response = await clientsClient.get( 'anything/clients/details' );
      const data = await response.json() as HttpBinResponse;

      expect( data.url ).toContain( '/anything/clients/details' );
    }, 10000 );

    it( 'should handle root path correctly', async () => {
      const response = await contractsClient.get( 'anything/contracts' );
      const data = await response.json() as HttpBinResponse;

      expect( data.url ).toMatch( /\/anything\/contracts\/?$/ );
    }, 10000 );

    it( 'should handle POST to specific endpoints', async () => {
      const testContract = { clientId: '123', title: 'Test Contract', value: 5000 };
      const response = await contractsClient.post( 'anything/contracts/create', { json: testContract } );
      const data = await response.json() as HttpBinResponse;

      expect( data.url ).toContain( '/anything/contracts/create' );
      expect( data.method ).toBe( 'POST' );
      expect( data.json ).toEqual( testContract );
    }, 10000 );
  } );

  describe( 'Authentication Override Patterns', () => {
    it( 'should allow per-request header overrides', async () => {
      const response = await clientsClient.get( 'anything/clients/public', {
        headers: {
          'X-API-Key': 'different-key-456'
        }
      } );
      const data = await response.json() as HttpBinResponse;

      expect( getHeader( data.headers, 'X-Api-Key' ) ).toBe( 'different-key-456' );
    }, 10000 );

    it( 'should support multiple authentication methods', async () => {
      const response = await contractsClient.get( 'anything/contracts/special', {
        headers: {
          'X-Special-Token': 'special-value',
          'X-Client-ID': 'client-123'
        }
      } );
      const data = await response.json() as HttpBinResponse;

      expect( getHeader( data.headers, 'Authorization' ) ).toMatch( /^Basic / );
      expect( getHeader( data.headers, 'X-Special-Token' ) ).toBe( 'special-value' );
      expect( getHeader( data.headers, 'X-Client-Id' ) ).toBe( 'client-123' );
    }, 10000 );
  } );

  describe( 'Real API Client Pattern', () => {
    it( 'should demonstrate the complete authentication pattern', async () => {

      const clientsResponse = await clientsClient.get( 'anything/clients' );
      const clientsData = await clientsResponse.json() as HttpBinResponse;
      expect( getHeader( clientsData.headers, 'X-Api-Key' ) ).toBe( 'demo-api-key-12345' );

      const createResponse = await clientsClient.post( 'anything/clients', {
        json: { name: 'Test Client', email: 'test@example.com' }
      } );
      const createData = await createResponse.json() as HttpBinResponse;
      expect( getHeader( createData.headers, 'X-Api-Key' ) ).toBe( 'demo-api-key-12345' );

      const exportResponse = await clientsClient.get( 'anything/clients/export', { headers: { 'X-API-Key': undefined } } );
      const exportData = await exportResponse.json() as HttpBinResponse;
      expect( getHeader( exportData.headers, 'X-Api-Key' ) ).toBeUndefined();

      const contractsResponse = await contractsClient.get( 'anything/contracts' );
      const contractsResponseData = await contractsResponse.json() as HttpBinResponse;
      expect( getHeader( contractsResponseData.headers, 'Authorization' ) ).toMatch( /^Basic / );

      const contractCreateResponse = await contractsClient.post( 'anything/contracts', {
        json: { clientId: '123', title: 'Service Agreement', value: 10000 }
      } );
      const contractCreateData = await contractCreateResponse.json() as HttpBinResponse;
      expect( getHeader( contractCreateData.headers, 'Authorization' ) ).toMatch( /^Basic / );
    }, 15000 );
  } );

  describe( 'Error Tracing', () => {
    beforeEach( () => {
      mockedTracing.addEventStart.mockClear();
      mockedTracing.addEventEnd.mockClear();
      mockedTracing.addEventError.mockClear();
    } );

    it( 'should trace timeout errors exactly once (no double-tracing)', async () => {
      const timeoutClient = httpClient( {
        prefix: 'https://httpbingo.org',
        timeout: 1 // 1ms timeout will definitely fail on /delay/5
      } );

      // Timeout will throw either TimeoutError or DOMException (AbortError)
      await expect( timeoutClient.get( 'delay/5' ) ).rejects.toThrow();

      // Timeout errors should be traced by the wrapped fetch exactly once
      expect( mockedTracing.addEventError ).toHaveBeenCalledTimes( 1 );
      const errorCall = mockedTracing.addEventError.mock.calls[0][0];
      expect( errorCall ).toHaveProperty( 'id' );
      expect( errorCall ).toHaveProperty( 'details' );

      // trace_error passes the thrown value as details for non-HTTPError (e.g. TimeoutError / DOMException)
      expect( errorCall.details ).toBeDefined();
      expect( typeof ( errorCall.details as { message?: string } ).message ).toBe( 'string' );
    }, 10000 );
  } );

  describe( 'Trace ID Lifecycle', () => {
    beforeEach( () => {
      mockedTracing.addEventStart.mockClear();
      mockedTracing.addEventEnd.mockClear();
      mockedTracing.addEventError.mockClear();
    } );

    it( 'should use same UUID trace ID for addEventStart and addEventEnd on successful requests', async () => {
      const response = await httpBinClient.get( 'anything/success-trace' );
      expect( response.status ).toBe( 200 );

      expect( mockedTracing.addEventStart ).toHaveBeenCalledTimes( 1 );
      expect( mockedTracing.addEventEnd ).toHaveBeenCalledTimes( 1 );

      const startCall = mockedTracing.addEventStart.mock.calls[0][0];
      const endCall = mockedTracing.addEventEnd.mock.calls[0][0];

      expect( isUuidFormat( startCall.id ) ).toBe( true );
      expect( isUuidFormat( endCall.id ) ).toBe( true );
      expect( startCall.id ).toBe( endCall.id );
    }, 10000 );

    it( 'should use same UUID trace ID for addEventStart and addEventError on HTTP errors', async () => {
      const noRetryClient = httpBinClient.extend( {
        retry: { limit: 0 }
      } );

      await expect( noRetryClient.get( 'status/500' ) ).rejects.toThrow();

      expect( mockedTracing.addEventStart ).toHaveBeenCalledTimes( 1 );
      expect( mockedTracing.addEventError ).toHaveBeenCalledTimes( 1 );

      const startCall = mockedTracing.addEventStart.mock.calls[0][0];
      const errorCall = mockedTracing.addEventError.mock.calls[0][0];

      expect( isUuidFormat( startCall.id ) ).toBe( true );
      expect( isUuidFormat( errorCall.id ) ).toBe( true );
      expect( startCall.id ).toBe( errorCall.id );
    }, 10000 );

    it( 'should use same UUID trace ID for addEventStart and addEventError on timeout errors', async () => {
      const timeoutClient = httpClient( {
        prefix: 'https://httpbingo.org',
        timeout: 50
      } );

      await expect( timeoutClient.get( 'delay/2' ) ).rejects.toThrow();

      expect( mockedTracing.addEventStart ).toHaveBeenCalledTimes( 1 );
      expect( mockedTracing.addEventError ).toHaveBeenCalledTimes( 1 );

      const startCall = mockedTracing.addEventStart.mock.calls[0][0];
      const errorCall = mockedTracing.addEventError.mock.calls[0][0];

      expect( isUuidFormat( startCall.id ) ).toBe( true );
      expect( isUuidFormat( errorCall.id ) ).toBe( true );
      expect( startCall.id ).toBe( errorCall.id );
    }, 10000 );

    it( 'should maintain trace ID consistency between ky hooks and wrapped fetch', async () => {
      const errorClient = httpClient( {
        prefix: 'https://httpbingo.org',
        timeout: 1,
        retry: { limit: 0 }
      } );

      try {
        await errorClient.get( 'delay/5' );
        expect.fail( 'Should have thrown timeout error' );
      } catch {
        // Expected timeout error
      }

      expect( mockedTracing.addEventStart ).toHaveBeenCalledTimes( 1 );
      expect( mockedTracing.addEventError ).toHaveBeenCalledTimes( 1 );

      const startCall = mockedTracing.addEventStart.mock.calls[0][0];
      const errorCall = mockedTracing.addEventError.mock.calls[0][0];

      expect( isUuidFormat( startCall.id ) ).toBe( true );
      expect( isUuidFormat( errorCall.id ) ).toBe( true );
      expect( startCall.id ).toBe( errorCall.id );
    }, 10000 );

    it( 'should always use UUID format when assignRequestId hook is present', async () => {
      const scenarios = [
        { method: 'GET', url: 'anything/test-1' },
        { method: 'POST', url: 'anything/test-2', body: { data: 'test' } },
        { method: 'PUT', url: 'anything/test-3', body: { update: true } },
        { method: 'DELETE', url: 'anything/test-4' }
      ];

      for ( const scenario of scenarios ) {
        mockedTracing.addEventStart.mockClear();
        mockedTracing.addEventEnd.mockClear();

        if ( scenario.method === 'GET' ) {
          await httpBinClient.get( scenario.url );
        } else if ( scenario.method === 'POST' ) {
          await httpBinClient.post( scenario.url, { json: scenario.body } );
        } else if ( scenario.method === 'PUT' ) {
          await httpBinClient.put( scenario.url, { json: scenario.body } );
        } else if ( scenario.method === 'DELETE' ) {
          await httpBinClient.delete( scenario.url );
        }

        const startCall = mockedTracing.addEventStart.mock.calls[0][0];
        const endCall = mockedTracing.addEventEnd.mock.calls[0][0];

        expect( isUuidFormat( startCall.id ) ).toBe( true );
        expect( isUuidFormat( endCall.id ) ).toBe( true );
        expect( startCall.id ).toBe( endCall.id );
      }
    }, 15000 );
  } );

  describe( 'No Tracing Without X-Request-ID', () => {
    beforeEach( () => {
      mockedTracing.addEventStart.mockClear();
      mockedTracing.addEventEnd.mockClear();
      mockedTracing.addEventError.mockClear();
      vi.spyOn( console, 'warn' ).mockImplementation( () => {} );
    } );

    afterEach( () => {
      vi.restoreAllMocks();
    } );

    it( 'should skip tracing when assignRequestId hook is not present', async () => {
      const noUuidClient = ky.create( {
        prefix: 'https://httpbingo.org',
        hooks: {
          beforeRequest: [
            traceRequest
          ],
          afterResponse: [
            traceResponse
          ],
          beforeError: [
            traceError
          ]
        }
      } );

      const response = await noUuidClient.get( 'anything/no-trace-test' );
      expect( response.status ).toBe( 200 );

      // No tracing should occur without X-Request-ID
      expect( mockedTracing.addEventStart ).not.toHaveBeenCalled();
      expect( mockedTracing.addEventEnd ).not.toHaveBeenCalled();

      // createTraceId / trace hooks warn when the header is missing
      expect( console.warn ).toHaveBeenCalled();
      expect( vi.mocked( console.warn ).mock.calls.some( c => String( c[0] ).includes( 'X-Request-ID' ) ) ).toBe( true );
    }, 10000 );

    it( 'should skip tracing for errors when X-Request-ID is missing', async () => {
      const noUuidClient = ky.create( {
        prefix: 'https://httpbingo.org',
        hooks: {
          beforeRequest: [ traceRequest ],
          afterResponse: [ traceResponse ],
          beforeError: [ traceError ]
        },
        retry: { limit: 0 }
      } );

      await expect( noUuidClient.get( 'status/500' ) ).rejects.toThrow();

      // No error tracing should occur without X-Request-ID
      expect( mockedTracing.addEventStart ).not.toHaveBeenCalled();
      expect( mockedTracing.addEventError ).not.toHaveBeenCalled();

      // Warning should be logged
      expect( console.warn ).toHaveBeenCalled();
    }, 10000 );
  } );

  describe( 'Trace ID Generation - Request Object Validation', () => {
    beforeEach( () => {
      mockedTracing.addEventStart.mockClear();
      mockedTracing.addEventEnd.mockClear();
      mockedTracing.addEventError.mockClear();
    } );

    it( 'should pass a valid Request object to createTraceId', async () => {
      const response = await httpBinClient.get( 'anything/trace-validation' );
      expect( response.status ).toBe( 200 );

      expect( mockedTracing.addEventStart ).toHaveBeenCalled();
      const startCall = mockedTracing.addEventStart.mock.calls[0][0];
      const traceId = startCall.id;

      // Trace ID should be a UUID from X-Request-ID header
      expect( isUuidFormat( traceId ) ).toBe( true );

      // An empty object would return null (no X-Request-ID header)
      const warnSpy = vi.spyOn( console, 'warn' ).mockImplementation( () => {} );
      const emptyObjectResult = createTraceId( {} as Request );
      expect( emptyObjectResult ).toBeNull();
      warnSpy.mockRestore();
    }, 10000 );

    it( 'should produce different trace IDs for GET vs POST to same endpoint', async () => {
      mockedTracing.addEventStart.mockClear();

      // Make GET request to specific endpoint
      const getResponse = await httpBinClient.get( 'anything/trace-same-endpoint' );
      expect( getResponse.status ).toBe( 200 );
      expect( mockedTracing.addEventStart ).toHaveBeenCalled();
      const getTraceId = mockedTracing.addEventStart.mock.calls[0][0].id;

      mockedTracing.addEventStart.mockClear();

      // Make POST request to SAME endpoint
      const postResponse = await httpBinClient.post( 'anything/trace-same-endpoint', { json: { data: 'test' } } );
      expect( postResponse.status ).toBe( 200 );
      expect( mockedTracing.addEventStart ).toHaveBeenCalled();
      const postTraceId = mockedTracing.addEventStart.mock.calls[0][0].id;

      expect( getTraceId ).not.toBe( postTraceId );
      expect( isUuidFormat( getTraceId ) ).toBe( true );
      expect( isUuidFormat( postTraceId ) ).toBe( true );
    }, 10000 );

    it( 'should generate unique trace IDs for identical requests', async () => {
      mockedTracing.addEventStart.mockClear();

      const response1 = await httpBinClient.get( 'anything/unique-requests-1' );
      expect( response1.status ).toBe( 200 );
      expect( mockedTracing.addEventStart ).toHaveBeenCalled();
      const traceId1 = mockedTracing.addEventStart.mock.calls[0][0].id;

      mockedTracing.addEventStart.mockClear();

      const response2 = await httpBinClient.get( 'anything/unique-requests-1' );
      expect( response2.status ).toBe( 200 );
      expect( mockedTracing.addEventStart ).toHaveBeenCalled();
      const traceId2 = mockedTracing.addEventStart.mock.calls[0][0].id;

      expect( isUuidFormat( traceId1 ) ).toBe( true );
      expect( isUuidFormat( traceId2 ) ).toBe( true );
      expect( traceId1 ).not.toBe( traceId2 );
    }, 10000 );

    it( 'should maintain trace ID consistency during timeout errors', async () => {
      const timeoutClient = httpClient( {
        prefix: 'https://httpbingo.org',
        timeout: 300
      } );

      mockedTracing.addEventStart.mockClear();
      mockedTracing.addEventError.mockClear();

      try {
        await timeoutClient.get( 'delay/3' );
        expect.fail( 'Should have thrown timeout error' );
      } catch {
        expect( mockedTracing.addEventStart ).toHaveBeenCalled();
        const startCall = mockedTracing.addEventStart.mock.calls[0][0];
        const requestTraceId = startCall.id;

        expect( mockedTracing.addEventError ).toHaveBeenCalled();
        const errorCall = mockedTracing.addEventError.mock.calls[0][0];
        const errorTraceId = errorCall.id;

        expect( isUuidFormat( requestTraceId ) ).toBe( true );
        expect( isUuidFormat( errorTraceId ) ).toBe( true );
        expect( requestTraceId ).toBe( errorTraceId );
      }
    }, 10000 );
  } );
} );
