import { step, z } from '@outputai/core';
import { createKyClient, undici } from '@outputai/http';

const client = createKyClient( {
  prefix: 'https://httpbin.io',
  throwHttpErrors: false
} );

export const headersStep = step( {
  name: 'kyHeaders',
  description: 'Returns the trace header received by httpbin',
  outputSchema: z.string(),
  fn: async () => {
    const body = await client.get( 'headers' ).json<{ headers: Record<string, string[]> }>();
    return body.headers['X-Request-Trace-Id']?.[0] ?? '';
  }
} );

export const jsonStep = step( {
  name: 'kyJson',
  description: 'Sends and returns a JSON request body',
  outputSchema: z.object( {
    name: z.string(),
    active: z.boolean()
  } ),
  fn: async () => {
    const data = { name: 'example', active: true };
    const body = await client.post( 'post', { json: data } ).json<{ json: typeof data }>();
    return body.json;
  }
} );

export const urlEncodedFormStep = step( {
  name: 'kyUrlEncodedForm',
  description: 'Sends a URL-encoded form',
  outputSchema: z.string(),
  fn: async () => {
    const body = await client.post( 'post', {
      body: new URLSearchParams( { source: 'url-encoded' } )
    } ).json<{ form: Record<string, string[]> }>();
    return body.form.source?.[0] ?? '';
  }
} );

export const nodeFormDataStep = step( {
  name: 'kyNodeFormData',
  description: 'Sends Node FormData through the Ky client',
  outputSchema: z.string(),
  fn: async () => {
    const form = new globalThis.FormData();
    form.set( 'source', 'node' );
    const body = await client.post( 'post', { body: form } ).json<{ form: Record<string, string[]> }>();
    return body.form.source?.[0] ?? '';
  }
} );

export const undiciFormDataStep = step( {
  name: 'kyUndiciFormData',
  description: 'Sends Undici FormData through the Ky client',
  outputSchema: z.string(),
  fn: async () => {
    const form = new undici.FormData();
    form.set( 'source', 'undici' );
    const body = await client.post( 'post', { body: form } ).json<{ form: Record<string, string[]> }>();
    return body.form.source?.[0] ?? '';
  }
} );

export const successStatusStep = step( {
  name: 'kySuccessStatus',
  description: 'Returns a successful HTTP status',
  outputSchema: z.number(),
  fn: async () => ( await client.get( 'status/200' ) ).status
} );

export const clientErrorStatusStep = step( {
  name: 'kyClientErrorStatus',
  description: 'Returns a client error status without throwing',
  outputSchema: z.number(),
  fn: async () => ( await client.get( 'status/404' ) ).status
} );

export const serverErrorStatusStep = step( {
  name: 'kyServerErrorStatus',
  description: 'Returns a server error status without throwing',
  outputSchema: z.number(),
  fn: async () => ( await client.get( 'status/500' ) ).status
} );

export const timeoutStep = step( {
  name: 'kyTimeout',
  description: 'Times out a delayed request and returns its error',
  outputSchema: z.string(),
  fn: async () => {
    try {
      await client.get( 'delay/2', { timeout: 100 } );
      return 'request completed';
    } catch ( error ) {
      return error instanceof Error ? `${error.name}: ${error.message}` : String( error );
    }
  }
} );

export const redirectStep = step( {
  name: 'kyRedirect',
  description: 'Follows redirects and returns the final URL',
  outputSchema: z.string(),
  fn: async () => ( await client.get( 'redirect/2' ) ).url
} );

export const manualRedirectStep = step( {
  name: 'kyManualRedirect',
  description: 'Returns a redirect response without following it',
  outputSchema: z.number(),
  fn: async () => ( await client.get( 'redirect/1', { redirect: 'manual' } ) ).status
} );

export const basicAuthStep = step( {
  name: 'kyBasicAuth',
  description: 'Authenticates using a Basic authorization header',
  outputSchema: z.number(),
  fn: async () => {
    const credentials = Buffer.from( 'demo-user:demo-pass' ).toString( 'base64' );
    return ( await client.get( 'basic-auth/demo-user/demo-pass', {
      headers: { authorization: `Basic ${credentials}` }
    } ) ).status;
  }
} );

export const bearerAuthFailureStep = step( {
  name: 'kyBearerAuthFailure',
  description: 'Returns the status for missing Bearer authentication',
  outputSchema: z.number(),
  fn: async () => ( await client.get( 'bearer' ) ).status
} );

export const compressionStep = step( {
  name: 'kyCompression',
  description: 'Reads a compressed JSON response',
  outputSchema: z.boolean(),
  fn: async () => {
    const body = await client.get( 'gzip' ).json<{ gzipped: boolean }>();
    return body.gzipped;
  }
} );

export const streamStep = step( {
  name: 'kyStream',
  description: 'Consumes a streamed response and returns its line count',
  outputSchema: z.number(),
  fn: async () => {
    const body = await client.get( 'stream/3' ).text();
    return body.trim().split( '\n' ).length;
  }
} );
