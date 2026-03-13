import { httpClient, HttpClientOptions } from '@outputai/http';
import type { HttpBinResponse, ClientInput, ContractInput } from './types.js';

const httpBinClient = httpClient( {
  prefixUrl: 'https://httpbin.io/anything',
  timeout: 3000
} );

const clientsClient = httpBinClient.extend( options => ( {
  prefixUrl: `${options.prefixUrl}/clients`,
  headers: {
    'X-API-Key': 'demo-api-key-12345'
  }
} ) as HttpClientOptions );

const contractsClient = httpBinClient.extend( options => ( {
  prefixUrl: `${options.prefixUrl}/contracts`,
  headers: {
    Authorization: `Basic ${Buffer.from( 'demo-user:demo-pass' ).toString( 'base64' )}`
  },
  timeout: 30000
} ) as HttpClientOptions );

/**
 * Get clients endpoint using API key authentication
 * Returns httpbin.io response showing the request was made successfully
 */
export async function getClients(): Promise<HttpBinResponse> {
  const response = await clientsClient.get( '' );
  return response.json() as Promise<HttpBinResponse>;
}

/**
 * Create client endpoint using API key authentication
 * Returns httpbin.io response showing the request was made successfully
 */
export async function createClient( data: ClientInput ): Promise<HttpBinResponse> {
  const response = await clientsClient.post( '', { json: data } );
  return response.json() as Promise<HttpBinResponse>;
}

/**
 * Export endpoint with no authentication (removes auth headers)
 * Returns httpbin.io response showing the request was made successfully
 */
export async function exportClients(): Promise<HttpBinResponse> {
  // Override to remove authentication completely
  const response = await clientsClient.get( 'export', {
    headers: {} // This removes inherited headers
  } );
  return response.json() as Promise<HttpBinResponse>;
}

/**
 * Get contracts endpoint using Basic authentication
 * Returns httpbin.io response showing the request was made successfully
 */
export async function getContracts(): Promise<HttpBinResponse> {
  const response = await contractsClient.get( '' );
  return response.json() as Promise<HttpBinResponse>;
}

/**
 * Create contract endpoint using Basic authentication
 * Returns httpbin.io response showing the request was made successfully
 */
export async function createContract( data: ContractInput ): Promise<HttpBinResponse> {
  const response = await contractsClient.post( '', { json: data } );
  return response.json() as Promise<HttpBinResponse>;
}
