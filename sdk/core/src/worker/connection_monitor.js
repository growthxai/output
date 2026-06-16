import { createChildLogger } from '#logger';
import { setTimeout as delay } from 'node:timers/promises';

const ServingStatus = {
  UNKNOWN: 0,
  SERVING: 1,
  NOT_SERVING: 2,
  SERVICE_UNKNOWN: 3
};

const logger = createChildLogger( 'Connection' );

const MAX_FAILURES = 3;
const CHECK_INTERVAL_MS = 30_000;
const CHECK_TIMEOUT_MS = 5_000;

const watchConnection = async ( connection, state = { failures: 0 } ) => {
  try {
    const timeout = delay( CHECK_TIMEOUT_MS, 0, { ref: false } )
      .then( () => {
        throw new Error( 'Connection health check timed out' );
      } );

    const health = await Promise.race( [ connection.healthService.check( {} ), timeout ] );

    if ( health.status !== ServingStatus.SERVING ) {
      throw new Error( `Connection not serving (status ${health.status})` );
    }

    logger.info( state.failures === 0 ? 'Healthy' : 'Recovered' );
    state.failures = 0;
  } catch ( e ) {
    state.failures++;
    if ( state.failures >= MAX_FAILURES ) {
      throw e;
    } else {
      logger.warn( 'Connection unhealthy', { error: e.message, ...state } );
    }
  }

  await delay( CHECK_INTERVAL_MS, 0, { ref: false } );
  return watchConnection( connection, state );
};

export const setupConnectionMonitor = ( { connection } ) => watchConnection( connection );
