import { Logger } from '@outputai/core';
import { EnvHttpProxyAgent, fetch } from 'undici';

const logger = Logger.createLogger( 'LLM' );
const costTableUrl = 'https://models.dev/api.json';
const cacheTTL = 1000 * 60 * 60 * 24; // 1 day

/* Ignore HTTP/2. Check: https://github.com/growthxai/output/issues/299 */
const dispatcher = new EnvHttpProxyAgent( { allowH2: false } );

export const cache = {
  content: null,
  expiresAt: 0
};

const buildModelMap = data => {
  const map = new Map();
  for ( const provider of Object.values( data ) ) {
    for ( const [ modelName, { cost } ] of Object.entries( provider.models ?? {} ) ) {
      if ( cost ) { // some models don't have cost
        map.set( modelName, cost );
        map.set( `${provider.id}/${modelName}`, cost );
      }
    }
  }
  return map;
};

const buildErrorMessage = cause => `Error "${cause}" when fetching models pricing at ${costTableUrl}`;

export const fetchModelsPricing = async () => {
  if ( cache.content && cache.expiresAt > Date.now() ) {
    return cache.content;
  }

  const state = { errorMessage: null, table: null };

  try {
    const res = await fetch( costTableUrl, { dispatcher } );
    if ( res.ok ) {
      state.table = await res.json();
    } else {
      state.errorMessage = buildErrorMessage( res.status );
    }
  } catch ( error ) {
    state.errorMessage = buildErrorMessage( error.code ?? error.name ?? error.constructor.name );
  }

  if ( state.errorMessage ) {
    if ( cache.content ) {
      logger.warn( state.errorMessage + ', falling back to stale cache' );
      return cache.content;
    }
    logger.error( state.errorMessage );
    return null;
  }

  cache.content = buildModelMap( state.table );
  cache.expiresAt = Date.now() + cacheTTL;
  return cache.content;
};
