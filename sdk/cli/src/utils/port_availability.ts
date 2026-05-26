import net from 'node:net';

/**
 * Check if a specific port is taken by attempting to bind a TCP server.
 * 
 * Binds on `0.0.0.0` (not loopback) to match the publish address docker
 * compose uses for `${PORT}:${TARGET}` mappings. Errors other than `EADDRINUSE`
 * are treated as "free" so we don't abort on conditions docker would accept.
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

/**
 * Probe each port by attempting to bind a TCP server on `0.0.0.0`. Returns
 * all ports that are currently in use (listening with `EADDRINUSE` errors).
 *
 * This function checks multiple ports concurrently and filters to return only
 * those that are unavailable. Docker remains the ultimate decider for
 * ambiguous cases during actual compose up.
 */
export async function findUnavailablePorts( ports: number[] ): Promise<number[]> {
  const results = await Promise.all(
    ports.map( async port => ( { port, taken: await isPortTaken( port ) } ) )
  );
  return results.filter( r => r.taken ).map( r => r.port );
}