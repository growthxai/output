import net from 'node:net';

/**
 * Probe each port by attempting to bind a TCP server on `0.0.0.0`. Returns
 * the first port whose listen call errors with `EADDRINUSE`, or `null` when
 * every port is free.
 *
 * Bind on `0.0.0.0` (not loopback) to match the publish address docker
 * compose uses for `${PORT}:${TARGET}` mappings — the same surface that
 * would collide at `docker compose up` time. Errors other than `EADDRINUSE`
 * (e.g. `EACCES` for privileged ports) are treated as "free" so we don't
 * abort on conditions docker would itself accept; docker remains the
 * ultimate decider for ambiguous cases.
 */
function isPortTaken( port: number ): Promise<boolean> {
  return new Promise<boolean>( resolve => {
    const server = net.createServer();
    const settle = ( value: boolean ): void => {
      server.removeAllListeners();
      if ( value ) {
        resolve( true );
        return;
      }
      server.close( () => resolve( false ) );
    };
    server.once( 'error', ( err: NodeJS.ErrnoException ) => {
      settle( err.code === 'EADDRINUSE' );
    } );
    server.once( 'listening', () => {
      settle( false );
    } );
    server.listen( port, '0.0.0.0' );
  } );
}

export async function findUnavailablePort( ports: number[] ): Promise<number | null> {
  for ( const port of ports ) {
    const taken = await isPortTaken( port );
    if ( taken ) {
      return port;
    }
  }
  return null;
}
