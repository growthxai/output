import { step, z } from '@outputai/core';
import { instrumentedFetch, undici } from '@outputai/http';

const HTTPBIN = 'https://httpbin.io';

export const headersStep = step( {
  name: 'fetchHeaders',
  description: 'Returns the trace header received by httpbin',
  outputSchema: z.string(),
  fn: async () => {
    const response = await instrumentedFetch( `${HTTPBIN}/headers` );
    const body = await response.json() as { headers: Record<string, string[]> };
    return body.headers['X-Request-Trace-Id']?.[0] ?? '';
  }
} );

export const jsonStep = step( {
  name: 'fetchJson',
  description: 'Sends and returns a JSON request body',
  outputSchema: z.object( {
    name: z.string(),
    active: z.boolean()
  } ),
  fn: async () => {
    const data = { name: 'example', active: true };
    const response = await instrumentedFetch( `${HTTPBIN}/post`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify( data )
    } );
    const body = await response.json() as { json: typeof data };
    return body.json;
  }
} );

export const urlEncodedFormStep = step( {
  name: 'fetchUrlEncodedForm',
  description: 'Sends a URL-encoded form',
  outputSchema: z.string(),
  fn: async () => {
    const response = await instrumentedFetch( `${HTTPBIN}/post`, {
      method: 'POST',
      body: new URLSearchParams( { source: 'url-encoded' } )
    } );
    const body = await response.json() as { form: Record<string, string[]> };
    return body.form.source?.[0] ?? '';
  }
} );

export const nodeFormDataStep = step( {
  name: 'fetchNodeFormData',
  description: 'Sends Node FormData through Undici normalization',
  outputSchema: z.string(),
  fn: async () => {
    const form = new globalThis.FormData();
    form.set( 'source', 'node' );
    const response = await instrumentedFetch( `${HTTPBIN}/post`, { method: 'POST', body: form } );
    const body = await response.json() as { form: Record<string, string[]> };
    return body.form.source?.[0] ?? '';
  }
} );

export const undiciFormDataStep = step( {
  name: 'fetchUndiciFormData',
  description: 'Sends Undici FormData directly',
  outputSchema: z.string(),
  fn: async () => {
    const form = new undici.FormData();
    form.set( 'source', 'undici' );
    const response = await instrumentedFetch( `${HTTPBIN}/post`, { method: 'POST', body: form } );
    const body = await response.json() as { form: Record<string, string[]> };
    return body.form.source?.[0] ?? '';
  }
} );

export const successStatusStep = step( {
  name: 'fetchSuccessStatus',
  description: 'Returns a successful HTTP status',
  outputSchema: z.number(),
  fn: async () => ( await instrumentedFetch( `${HTTPBIN}/status/200` ) ).status
} );

export const clientErrorStatusStep = step( {
  name: 'fetchClientErrorStatus',
  description: 'Returns a client error status without throwing',
  outputSchema: z.number(),
  fn: async () => ( await instrumentedFetch( `${HTTPBIN}/status/404` ) ).status
} );

export const serverErrorStatusStep = step( {
  name: 'fetchServerErrorStatus',
  description: 'Returns a server error status without throwing',
  outputSchema: z.number(),
  fn: async () => ( await instrumentedFetch( `${HTTPBIN}/status/500` ) ).status
} );

export const timeoutStep = step( {
  name: 'fetchTimeout',
  description: 'Aborts a delayed request and returns its error',
  outputSchema: z.string(),
  fn: async () => {
    try {
      await instrumentedFetch( `${HTTPBIN}/delay/2`, { signal: AbortSignal.timeout( 100 ) } );
      return 'request completed';
    } catch ( error ) {
      return error instanceof Error ? `${error.name}: ${error.message}` : String( error );
    }
  }
} );

export const redirectStep = step( {
  name: 'fetchRedirect',
  description: 'Follows redirects and returns the final URL',
  outputSchema: z.string(),
  fn: async () => ( await instrumentedFetch( `${HTTPBIN}/redirect/2` ) ).url
} );

export const manualRedirectStep = step( {
  name: 'fetchManualRedirect',
  description: 'Returns a redirect response without following it',
  outputSchema: z.number(),
  fn: async () => ( await instrumentedFetch( `${HTTPBIN}/redirect/1`, { redirect: 'manual' } ) ).status
} );

export const basicAuthStep = step( {
  name: 'fetchBasicAuth',
  description: 'Authenticates using a Basic authorization header',
  outputSchema: z.number(),
  fn: async () => {
    const credentials = Buffer.from( 'demo-user:demo-pass' ).toString( 'base64' );
    const response = await instrumentedFetch( `${HTTPBIN}/basic-auth/demo-user/demo-pass`, {
      headers: { authorization: `Basic ${credentials}` }
    } );
    return response.status;
  }
} );

export const bearerAuthFailureStep = step( {
  name: 'fetchBearerAuthFailure',
  description: 'Returns the status for missing Bearer authentication',
  outputSchema: z.number(),
  fn: async () => ( await instrumentedFetch( `${HTTPBIN}/bearer` ) ).status
} );

export const compressionStep = step( {
  name: 'fetchCompression',
  description: 'Reads a compressed JSON response',
  outputSchema: z.boolean(),
  fn: async () => {
    const response = await instrumentedFetch( `${HTTPBIN}/gzip` );
    const body = await response.json() as { gzipped: boolean };
    return body.gzipped;
  }
} );

export const streamStep = step( {
  name: 'fetchStream',
  description: 'Consumes a streamed response and returns its line count',
  outputSchema: z.number(),
  fn: async () => {
    const response = await instrumentedFetch( `${HTTPBIN}/stream/3` );
    const body = await response.text();
    return body.trim().split( '\n' ).length;
  }
} );
