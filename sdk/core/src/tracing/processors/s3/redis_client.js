import { createClient } from 'redis';
import { createChildLogger } from '#logger';
import { getVars } from './configs.js';

const log = createChildLogger( 'RedisClient' );

const state = {
  client: null,
  connectPromise: null
};

async function connect( url ) {
  if ( state.client ) {
    log.warn( 'Closing stale Redis client before reconnecting' );
    await state.client.quit().catch( quitErr => {
      log.warn( 'Failed to quit stale Redis client', { error: quitErr.message } );
    } );
    state.client = null;
  }

  const client = createClient( { url, socket: { keepAlive: 15000 } } );
  try {
    await client.connect();
    return state.client = client;
  } catch ( err ) {
    await client.quit().catch( () => {} );
    throw new Error( `Failed to connect to Redis: ${err.message} (${err.code || 'UNKNOWN'})`, { cause: err } );
  }
}

/**
 * Return a connected Redis instance with automatic reconnection.
 *
 * Performs health check on cached client via ping(). If healthy, returns cached
 * instance. Otherwise, closes stale client before creating new connection.
 * Concurrent calls during connection will receive the same pending promise.
 *
 * @returns {Promise<redis.RedisClientType>} Connected Redis client
 * @throws {Error} If connection fails (wrapped with context)
 */
export async function getRedisClient() {
  const url = getVars().redisUrl;

  const pingResult = await state.client?.ping().catch( err => {
    log.error( 'Redis ping failed', { error: err.message, code: err.code } );
    return null;
  } );

  if ( pingResult === 'PONG' ) {
    return state.client;
  }

  if ( state.connectPromise ) {
    return state.connectPromise;
  }

  state.connectPromise = connect( url ).finally( () => {
    state.connectPromise = null;
  } );

  return state.connectPromise;
}
