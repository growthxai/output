import { fetch } from '@outputai/http2';
import type { HttpBinResponse, ClientInput, ContractInput } from './types.js';

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

/** httpbin `/anything` mirror — echoes request method, headers, and body. */
const ANYTHING = 'https://httpbin.io/anything';

const getPath = ( segment: string ) => `${ANYTHING}${segment.startsWith( '/' ) ? segment : `/${segment}`}`;

const DEMO_API_KEY = 'demo-api-key-12345';
const BASIC_CREDENTIALS = 'demo-user:demo-pass';
const CONTRACTS_TIMEOUT_MS = 30_000;

const authHeaders = {
  apiKey: (): Record<string, string> => ( { 'X-API-Key': DEMO_API_KEY } ),
  /** Intentionally empty: no API key or Basic auth (only the wrapper’s request id header, if any). */
  none: (): Record<string, string> => ( {} ),
  basic: (): Record<string, string> => ( {
    Authorization: `Basic ${Buffer.from( BASIC_CREDENTIALS ).toString( 'base64' )}`
  } )
} as const;

/**
 * `fetch` then JSON; throws when the response is not OK (the Fetch API returns a body instead of rejecting).
 */
async function fetchJson( href: string, init?: FetchInit ): Promise<HttpBinResponse> {
  const response = await fetch( href, init );
  if ( !response.ok ) {
    const body = await response.text();
    throw new Error( `HTTP ${response.status}: ${body.slice( 0, 200 )}` );
  }
  return response.json() as Promise<HttpBinResponse>;
}

async function fetchJsonWithTimeout( href: string, init: FetchInit | undefined, timeoutMs: number ): Promise<HttpBinResponse> {
  const ac = new AbortController();
  const timer = setTimeout( () => {
    ac.abort();
  }, timeoutMs );
  try {
    return await fetchJson( href, { ...init, signal: ac.signal } );
  } finally {
    clearTimeout( timer );
  }
}

export async function getClients(): Promise<HttpBinResponse> {
  return fetchJson( getPath( '/clients' ), { headers: authHeaders.apiKey() } );
}

export async function createClient( data: ClientInput ): Promise<HttpBinResponse> {
  return fetchJson( getPath( '/clients' ), {
    method: 'POST',
    headers: {
      ...authHeaders.apiKey(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify( data )
  } );
}

export async function exportClients(): Promise<HttpBinResponse> {
  return fetchJson( getPath( '/clients/export' ), { headers: authHeaders.none() } );
}

export async function getContracts(): Promise<HttpBinResponse> {
  return fetchJsonWithTimeout( getPath( '/contracts' ), { headers: authHeaders.basic() }, CONTRACTS_TIMEOUT_MS );
}

export async function createContract( data: ContractInput ): Promise<HttpBinResponse> {
  return fetchJsonWithTimeout( getPath( '/contracts' ), {
    method: 'POST',
    headers: {
      ...authHeaders.basic(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify( data )
  }, CONTRACTS_TIMEOUT_MS );
}
