import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createSecureServer } from 'node:http2';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { Agent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';

const execFileAsync = promisify( execFile );

const withTestCertificate = async callback => {
  const directory = await mkdtemp( join( tmpdir(), 'output-http2-' ) );
  const keyPath = join( directory, 'key.pem' );
  const certPath = join( directory, 'cert.pem' );

  try {
    await execFileAsync( 'openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', keyPath, '-out', certPath, '-days', '1',
      '-subj', '/CN=localhost'
    ] );
    const [ key, cert ] = await Promise.all( [ readFile( keyPath ), readFile( certPath ) ] );
    await callback( { key, cert } );
  } finally {
    await rm( directory, { recursive: true, force: true } );
  }
};

describe( 'global fetch compatibility', () => {
  it( 'decodes gzip after Undici is imported', async () => {
    await withTestCertificate( async ( { key, cert } ) => {
      const compressedBody = gzipSync( JSON.stringify( { ok: true } ) );
      const server = createSecureServer( { key, cert, allowHTTP1: true } );
      const dispatcher = new Agent( {
        allowH2: true,
        connect: { rejectUnauthorized: false }
      } );
      const previousDispatcher = getGlobalDispatcher();

      server.on( 'request', ( _request, response ) => {
        response.writeHead( 200, {
          'content-type': 'application/json',
          'content-encoding': 'gzip'
        } );
        response.end( compressedBody );
      } );

      try {
        server.listen( 0, '127.0.0.1' );
        await once( server, 'listening' );
        setGlobalDispatcher( dispatcher );

        const { port } = server.address();
        const response = await globalThis.fetch( `https://127.0.0.1:${port}/` );

        expect( response.headers.get( 'content-encoding' ) ).toBe( 'gzip' );
        await expect( response.json() ).resolves.toEqual( { ok: true } );
      } finally {
        setGlobalDispatcher( previousDispatcher );
        await dispatcher.close();
        if ( server.listening ) {
          await new Promise( resolve => server.close( resolve ) );
        }
      }
    } );
  } );
} );
