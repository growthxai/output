import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import net from 'node:net';
import { findUnavailablePort } from './port_availability.js';

/**
 * Open a real TCP server on an ephemeral port and return the bound port plus
 * a close helper. We can't hard-code a "known free" port for testing because
 * any port we pick could be taken on the dev machine — letting the OS hand
 * out an ephemeral one keeps the test deterministic across environments.
 */
function listenOnEphemeralPort(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise( ( resolve, reject ) => {
    const server = net.createServer();
    server.once( 'error', reject );
    server.listen( 0, '0.0.0.0', () => {
      const address = server.address();
      if ( typeof address !== 'object' || address === null ) {
        reject( new Error( 'failed to resolve ephemeral port address' ) );
        return;
      }
      resolve( {
        port: address.port,
        close: () => new Promise<void>( resolveClose => server.close( () => resolveClose() ) )
      } );
    } );
  } );
}

describe( 'findUnavailablePort', () => {
  const fixture: { occupied: { port: number; close: () => Promise<void> } | null } = { occupied: null };

  beforeEach( async () => {
    fixture.occupied = await listenOnEphemeralPort();
  } );

  afterEach( async () => {
    if ( fixture.occupied ) {
      await fixture.occupied.close();
      fixture.occupied = null;
    }
  } );

  it( 'returns null when given an empty array', async () => {
    expect( await findUnavailablePort( [] ) ).toBeNull();
  } );

  it( 'returns the occupied port when it is the only one probed', async () => {
    expect( await findUnavailablePort( [ fixture.occupied!.port ] ) ).toBe( fixture.occupied!.port );
  } );

  it( 'returns the first occupied port (does not probe past the failure)', async () => {
    // Two more ephemerals so we can assert "free" ports either side of the taken one.
    const free1 = await listenOnEphemeralPort();
    const free2 = await listenOnEphemeralPort();
    await free1.close();
    await free2.close();

    const result = await findUnavailablePort( [ free1.port, fixture.occupied!.port, free2.port ] );
    expect( result ).toBe( fixture.occupied!.port );
  } );

  it( 'returns null when every probed port is free', async () => {
    const free = await listenOnEphemeralPort();
    const port = free.port;
    await free.close();

    expect( await findUnavailablePort( [ port ] ) ).toBeNull();
  } );
} );
