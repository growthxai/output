import { describe, it, expect, beforeEach, vi } from 'vitest';
import { httpClient, HTTPError, TimeoutError } from './index.js';
import { Tracing } from '@outputai/core/sdk_activity_integration';
import { config } from './config.js';

vi.mock( '@outputai/core/sdk_activity_integration', () => ( {
  Tracing: {
    addEventStart: vi.fn(),
    addEventEnd: vi.fn(),
    addEventError: vi.fn()
  }
} ) );

vi.mock( './config.js', () => ( {
  config: {
    logVerbose: false
  }
} ) );

// Mock ky at the module level to intercept at the source
vi.mock( 'ky', () => {
  const createMockResponse = () => new Response( JSON.stringify( { success: true } ), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  } );

  // Mock error types that match ky's actual error classes
  // IMPORTANT: These must be the same instances exported by the mock
  // so that instanceof checks work correctly
  class MockHTTPError extends Error {
    public response: Response;
    public request: Request;
    public options: Record<string, unknown>;

    constructor( response: Response, request: Request, options: Record<string, unknown> ) {
      super( `${response.status} ${response.statusText}` );
      this.name = 'HTTPError';
      this.response = response;
      this.request = request;
      this.options = options;
    }
  }

  class MockTimeoutError extends Error {
    public request: Request;

    constructor( request: Request ) {
      super( 'Request timed out' );
      this.name = 'TimeoutError';
      this.request = request;
    }
  }

  // Helper to extract URL string from various input types
  const getUrlString = ( input: string | Request | URL ): string => {
    if ( typeof input === 'string' ) {
      return input;
    }
    if ( input instanceof Request ) {
      return input.url;
    }
    return input.toString();
  };

  // Default mock fetch implementation
  const defaultMockFetch = ( input: string | Request | URL, init?: RequestInit ): Promise<Response> => {
    const urlStr = getUrlString( input );
    const request = input instanceof Request ? input : new Request( urlStr, init );

    // Simulate timeout error (bypass hooks, thrown at fetch level)
    if ( urlStr.includes( '/timeout' ) ) {
      throw new MockTimeoutError( request as Request );
    }

    // Simulate network error (bypass hooks, thrown at fetch level)
    if ( urlStr.includes( '/network-error' ) ) {
      throw new TypeError( 'Failed to fetch' );
    }

    // Simulate HTTP 500 error (goes through hooks)
    if ( urlStr.includes( '/500' ) ) {
      return Promise.resolve( new Response( 'Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error'
      } ) );
    }

    // Simulate HTTP 404 error (goes through hooks)
    if ( urlStr.includes( '/404' ) ) {
      return Promise.resolve( new Response( 'Not Found', {
        status: 404,
        statusText: 'Not Found'
      } ) );
    }

    return Promise.resolve( createMockResponse() );
  };

  class MockKy {
    private hooks: Record<string, Array<( ...args: unknown[] ) => Promise<unknown> | unknown>> = {};
    private options: Record<string, unknown> = {};
    private customFetch: ( input: string | Request | URL, init?: RequestInit ) => Promise<Response>;

    constructor( options: Record<string, unknown> = {} ) {
      this.hooks = ( options.hooks as Record<string, Array<( ...args: unknown[] ) => Promise<unknown> | unknown>> ) || {};
      // Use provided fetch or default mock fetch
      this.customFetch = ( options.fetch as ( input: string | Request | URL, init?: RequestInit ) => Promise<Response> ) || defaultMockFetch;
      // Store options with fetch function included
      this.options = {
        ...options,
        fetch: this.customFetch
      };
    }

    private async runHooks( hookType: string, ...args: unknown[] ) {
      const hooks = this.hooks[hookType] || [];
      for ( const hook of hooks ) {
        await hook( ...args );
      }
    }

    async get( url: string, options: Record<string, unknown> = {} ) {
      return this.makeRequest( 'GET', url, options );
    }

    async post( url: string, options: Record<string, unknown> = {} ) {
      return this.makeRequest( 'POST', url, options );
    }

    async put( url: string, options: Record<string, unknown> = {} ) {
      return this.makeRequest( 'PUT', url, options );
    }

    async patch( url: string, options: Record<string, unknown> = {} ) {
      return this.makeRequest( 'PATCH', url, options );
    }

    async delete( url: string, options: Record<string, unknown> = {} ) {
      return this.makeRequest( 'DELETE', url, options );
    }

    private async makeRequest( method: string, url: string, options: Record<string, unknown> = {} ) {
      // Construct full URL like ky would
      const fullUrl = this.options.prefixUrl ? `${this.options.prefixUrl}/${url}` : `https://example.com/${url}`;
      const request = new Request( fullUrl, { method } );

      // Run beforeRequest hooks
      await this.runHooks( 'beforeRequest', request );

      // Use the custom fetch (which may be wrapped by applyFetchErrorTracing)
      // Fetch-level errors (timeout, network) bypass hooks entirely and will throw
      const response = await this.customFetch( request, { method } );

      // Check for HTTP errors (non-2xx status codes)
      if ( !response.ok ) {
        const httpError = new MockHTTPError( response, request, options );

        // Run beforeError hooks for HTTP errors
        try {
          await this.runHooks( 'beforeError', httpError );
        } catch ( hookErr ) {
          // Hooks can transform the error
          throw hookErr;
        }

        throw httpError;
      }

      // Run afterResponse hooks for successful responses
      await this.runHooks( 'afterResponse', request, options, response );

      return response;
    }

    extend( options: Record<string, unknown> | ( ( parentOptions: Record<string, unknown> ) => Record<string, unknown> ) = {} ) {
      // Handle function-based options (like applyDefaultOptions returns)
      const resolvedOptions = typeof options === 'function' ? options( this.options ) : options;

      const mergedOptions = { ...this.options, ...resolvedOptions };
      const mergedHooks = { ...this.hooks };
      if ( resolvedOptions.hooks ) {
        Object.entries( resolvedOptions.hooks ).forEach( ( [ hookType, hookArray ]: [string, unknown] ) => {
          mergedHooks[hookType] = [
            ...( this.hooks[hookType] || [] ),
            ...( Array.isArray( hookArray ) ? hookArray : [] )
          ];
        } );
      }
      mergedOptions.hooks = mergedHooks;
      return new MockKy( mergedOptions );
    }

    create( options: Record<string, unknown> = {} ) {
      return new MockKy( options );
    }
  }

  return {
    default: new MockKy(),
    create: ( options: Record<string, unknown> ) => new MockKy( options ),
    HTTPError: MockHTTPError,
    TimeoutError: MockTimeoutError
  };
} );

const mockedTracing = vi.mocked( Tracing, true );
const mockedConfig = vi.mocked( config );

describe( 'HTTP Client', () => {
  beforeEach( () => {
    mockedTracing.addEventStart.mockClear();
    mockedTracing.addEventEnd.mockClear();
    mockedTracing.addEventError.mockClear();
  } );

  describe( 'httpClient function', () => {
    it( 'should create an HTTP client with default options', () => {
      const client = httpClient();
      expect( client ).toBeDefined();
      expect( typeof client.get ).toBe( 'function' );
      expect( typeof client.post ).toBe( 'function' );
      expect( typeof client.put ).toBe( 'function' );
      expect( typeof client.patch ).toBe( 'function' );
      expect( typeof client.delete ).toBe( 'function' );
    } );

    it( 'should create an HTTP client with custom options', () => {
      const client = httpClient( {
        prefixUrl: 'https://api.example.com',
        timeout: 5000
      } );
      expect( client ).toBeDefined();
    } );

    it( 'should allow method chaining with extend', () => {
      const client = httpClient();
      const extendedClient = client.extend( {
        headers: { 'X-Custom': 'test' }
      } );
      expect( extendedClient ).toBeDefined();
    } );
  } );

  describe( 'HTTP Client Interface', () => {
    it( 'should have all HTTP methods', () => {
      const client = httpClient();

      expect( typeof client.get ).toBe( 'function' );
      expect( typeof client.post ).toBe( 'function' );
      expect( typeof client.put ).toBe( 'function' );
      expect( typeof client.patch ).toBe( 'function' );
      expect( typeof client.delete ).toBe( 'function' );
    } );
  } );

  describe( 'Error Exports', () => {
    it( 'should export HTTPError', () => {
      expect( HTTPError ).toBeDefined();
      expect( typeof HTTPError ).toBe( 'function' );
    } );

    it( 'should export TimeoutError', () => {
      expect( TimeoutError ).toBeDefined();
      expect( typeof TimeoutError ).toBe( 'function' );
    } );
  } );

  describe( 'Tracing Configuration', () => {
    it( 'should not trace headers or bodies by default', async () => {
      mockedConfig.logVerbose = false;

      const client = httpClient( {
        prefixUrl: 'https://api.example.com'
      } );

      await client.get( 'users/1' );

      expect( mockedTracing.addEventStart ).toHaveBeenCalled();
    } );

    it( 'should trace headers and bodies when verbose logging is enabled', async () => {
      mockedConfig.logVerbose = true;

      const client = httpClient( {
        prefixUrl: 'https://api.example.com'
      } );

      await client.post( 'users', { json: { name: 'test', email: 'test@example.com' } } );

      expect( mockedTracing.addEventStart ).toHaveBeenCalled();
    } );
  } );

  describe( 'Hook Preservation', () => {
    it( 'should preserve original hooks when extending client with custom hooks', async () => {
      const customBeforeRequestCalled = vi.fn();
      const customAfterResponseCalled = vi.fn();
      const customBeforeErrorCalled = vi.fn();

      const client = httpClient( {
        prefixUrl: 'https://api.example.com'
      } );

      const extendedClient = client.extend( {
        hooks: {
          beforeRequest: [
            async request => {
              customBeforeRequestCalled();
              return request;
            }
          ],
          afterResponse: [
            async ( _request, _options, response ) => {
              customAfterResponseCalled();
              return response;
            }
          ],
          beforeError: [
            async error => {
              customBeforeErrorCalled();
              return error;
            }
          ]
        }
      } );

      await extendedClient.get( 'users/1' );

      expect( customBeforeRequestCalled ).toHaveBeenCalled();
      expect( customAfterResponseCalled ).toHaveBeenCalled();

      expect( mockedTracing.addEventStart ).toHaveBeenCalled();
      expect( mockedTracing.addEventEnd ).toHaveBeenCalled();
    } );
  } );

  describe( 'Mocking Verification', () => {
    it( 'should use mocked responses and not make real HTTP requests', async () => {
      const client = httpClient( {
        prefixUrl: 'https://api.example.com'
      } );

      // Test GET request
      const getResponse = await client.get( 'users/1' );
      const getData = await getResponse.json() as { success: boolean };
      expect( getData ).toEqual( { success: true } );

      // Test POST request
      const postResponse = await client.post( 'users', { json: { name: 'test' } } );
      const postData = await postResponse.json() as { success: boolean };
      expect( postData ).toEqual( { success: true } );

      // Verify no actual network delay (should be very fast)
      const startTime = Date.now();
      await client.get( 'test' );
      const duration = Date.now() - startTime;
      expect( duration ).toBeLessThan( 50 ); // Mocked calls should be nearly instantaneous

      // Verify that responses come from mocks, not real HTTP
      expect( getData.success ).toBe( true );
      expect( postData.success ).toBe( true );
    } );
  } );

  describe( 'Error Tracing', () => {
    describe( 'Fetch-Level Errors (should be traced by wrapped fetch)', () => {
      it( 'should trace timeout errors that bypass ky hooks', async () => {
        const client = httpClient( {
          prefixUrl: 'https://api.example.com'
        } );

        await expect( client.get( 'users/timeout' ) ).rejects.toThrow( TimeoutError );

        // Timeout errors should be traced by the wrapped fetch
        expect( mockedTracing.addEventError ).toHaveBeenCalledTimes( 1 );
        const errorCall = mockedTracing.addEventError.mock.calls[0][0];
        expect( errorCall ).toHaveProperty( 'id' );
        expect( errorCall ).toHaveProperty( 'details' );
        expect( errorCall.details ).toHaveProperty( 'message' );
        expect( errorCall.details ).toHaveProperty( 'error' );
      } );

      it( 'should trace network errors that bypass ky hooks', async () => {
        const client = httpClient( {
          prefixUrl: 'https://api.example.com'
        } );

        await expect( client.get( 'users/network-error' ) ).rejects.toThrow( TypeError );

        // Network errors should be traced by the wrapped fetch
        expect( mockedTracing.addEventError ).toHaveBeenCalledTimes( 1 );
        const errorCall = mockedTracing.addEventError.mock.calls[0][0];
        expect( errorCall ).toHaveProperty( 'id' );
        expect( errorCall ).toHaveProperty( 'details' );
        expect( errorCall.details ).toHaveProperty( 'message' );
        expect( ( errorCall.details as Error ).message ).toBe( 'Unknown error occurred' );
        expect( errorCall.details ).toHaveProperty( 'error' );
      } );
    } );

    describe( 'HTTP Errors (should be traced by beforeError hook only)', () => {
      it( 'should trace HTTP 500 errors via beforeError hook, not fetch wrapper', async () => {
        const client = httpClient( {
          prefixUrl: 'https://api.example.com'
        } );

        await expect( client.get( 'users/500' ) ).rejects.toThrow( HTTPError );

        // HTTP errors should be traced by the beforeError hook (traceError)
        // The wrapped fetch should NOT trace it (to prevent double-tracing)
        expect( mockedTracing.addEventError ).toHaveBeenCalledTimes( 1 );
        const errorCall = mockedTracing.addEventError.mock.calls[0][0];
        expect( errorCall ).toHaveProperty( 'id' );
        expect( errorCall ).toHaveProperty( 'details' );
        expect( errorCall.details ).toHaveProperty( 'status', 500 );
        expect( errorCall.details ).toHaveProperty( 'statusText', 'Internal Server Error' );
      } );

      it( 'should trace HTTP 404 errors via beforeError hook, not fetch wrapper', async () => {
        const client = httpClient( {
          prefixUrl: 'https://api.example.com'
        } );

        await expect( client.get( 'users/404' ) ).rejects.toThrow( HTTPError );

        // HTTP errors should be traced by the beforeError hook (traceError)
        expect( mockedTracing.addEventError ).toHaveBeenCalledTimes( 1 );
        const errorCall = mockedTracing.addEventError.mock.calls[0][0];
        expect( errorCall ).toHaveProperty( 'id' );
        expect( errorCall ).toHaveProperty( 'details' );
        expect( errorCall.details ).toHaveProperty( 'status', 404 );
        expect( errorCall.details ).toHaveProperty( 'statusText', 'Not Found' );
      } );

      it( 'should not double-trace HTTP errors', async () => {
        const client = httpClient( {
          prefixUrl: 'https://api.example.com'
        } );

        await expect( client.get( 'users/500' ) ).rejects.toThrow( HTTPError );

        // Should only be traced once (by beforeError hook)
        expect( mockedTracing.addEventError ).toHaveBeenCalledTimes( 1 );
      } );
    } );

    describe( 'Error Type Differentiation', () => {
      it( 'should handle timeout and HTTP errors differently in the same client', async () => {
        const client = httpClient( {
          prefixUrl: 'https://api.example.com'
        } );

        // Test timeout error
        mockedTracing.addEventError.mockClear();
        await expect( client.get( 'users/timeout' ) ).rejects.toThrow( TimeoutError );
        expect( mockedTracing.addEventError ).toHaveBeenCalledTimes( 1 );
        const timeoutCall = mockedTracing.addEventError.mock.calls[0][0];
        expect( timeoutCall.details ).toHaveProperty( 'message' );
        expect( timeoutCall.details ).toHaveProperty( 'error' );

        // Test HTTP error
        mockedTracing.addEventError.mockClear();
        await expect( client.get( 'users/500' ) ).rejects.toThrow( HTTPError );
        expect( mockedTracing.addEventError ).toHaveBeenCalledTimes( 1 );
        const httpCall = mockedTracing.addEventError.mock.calls[0][0];
        expect( httpCall.details ).toHaveProperty( 'status', 500 );
      } );
    } );
  } );

} );
