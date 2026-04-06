/**
 * Custom ky-based HTTP client for Orval-generated API
 */

import ky from 'ky';
import type { Options as KyOptions } from 'ky';
import { config } from '#config.js';

/**
 * Custom error class for HTTP errors with response details
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public response: {
      status: number;
      data?: unknown;
      headers?: Headers;
    }
  ) {
    super( message );
    this.name = 'HttpError';
  }
}

/**
 * Custom API request options that extend RequestInit with additional config
 */
export type ApiRequestOptions = RequestInit & {
  params?: Record<string, unknown>;
  config?: KyOptions;
};

const api = ky.create( {
  prefix: config.apiUrl,
  timeout: config.requestTimeout,
  retry: {
    limit: 2,
    methods: [ 'get', 'put', 'head', 'delete', 'options', 'trace' ],
    statusCodes: [ 408, 413, 429, 502, 503, 504 ]
  },
  throwHttpErrors: false,
  hooks: {
    beforeRequest: [
      ( { request } ) => {
        // Add auth token if available
        if ( config.apiToken ) {
          request.headers.set( 'Authorization', `Basic ${config.apiToken}` );
        }
      }
    ]
  }
} );

const stripLeadingSlash = ( url: string ): string =>
  url.startsWith( '/' ) ? url.slice( 1 ) : url;

const buildKyOptions = ( options: ApiRequestOptions ) => {
  // Extract params, config, and body for special handling
  const { params, config: customConfig, body, ...restOptions } = options;

  return {
    // Pass through standard RequestInit options
    ...restOptions,
    // Convert params to searchParams for ky (if not already in config)
    searchParams: customConfig?.searchParams || ( params as Record<string, string> ),
    // Only include body for non-GET requests
    ...( body && options.method !== 'GET' ? { body } : {} ),
    // Spread any ky-specific config options
    ...customConfig
  };
};

const wrapResponse = ( response: Response, data: unknown ) => ( {
  data,
  status: response.status,
  headers: response.headers
} );

export const customFetchInstance = async <T>(
  url: string,
  options: ApiRequestOptions
): Promise<T> => {
  const response = await api(
    stripLeadingSlash( url ),
    buildKyOptions( options )
  );

  const data = await response.json().catch( () => undefined );

  // Throw for non-2xx responses so catch handlers can process errors
  if ( !response.ok ) {
    const errorData = data as { error?: string; message?: string } | undefined;
    const message = errorData?.message || `HTTP ${response.status} error`;
    throw new HttpError( message, {
      status: response.status,
      data: errorData,
      headers: response.headers
    } );
  }

  return wrapResponse( response, data ) as T;
};
