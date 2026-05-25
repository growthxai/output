import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import net from 'node:net';
import { findUnavailablePorts } from './port_availability.js';

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

describe( 'findUnavailablePorts', () => {
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

  it( 'returns an empty array when given no ports', async () => {
    expect( await findUnavailablePorts( [] ) ).toEqual( [] );
  } );

  it( 'returns the occupied port when it is the only one probed', async () => {
    expect( await findUnavailablePorts( [ fixture.occupied!.port ] ) ).toEqual( [ fixture.occupied!.port ] );
  } );

  it( 'returns all occupied ports, not just the first one', async () => {
    const second = await listenOnEphemeralPort();
    try {
      const free = await listenOnEphemeralPort();
      await free.close();

      const result = await findUnavailablePorts( [ fixture.occupied!.port, free.port, second.port ] );
      expect( result.sort() ).toEqual( [ fixture.occupied!.port, second.port ].sort() );
    } finally {
      await second.close();
    }
  } );

  it( 'returns an empty array when every probed port is free', async () => {
    const free = await listenOnEphemeralPort();
    const port = free.port;
    await free.close();

    expect( await findUnavailablePorts( [ port ] ) ).toEqual( [] );
  } );
} );
