import { Logger } from '@outputai/core';
import { EnvHttpProxyAgent, fetch } from 'undici';
import modelsPricingSnapshot from './models_pricing_snapshot.json' with { type: 'json' };

const logger = Logger.createLogger( 'LLM' );
const costTableUrl = 'https://models.dev/api.json';
const cacheTTL = 1000 * 60 * 60 * 24; // 1 day
const cooldownTTL = 1000 * 60 * 10; // 10 minutes

/* Ignore HTTP/2. Check: https://github.com/growthxai/output/issues/299 */
const dispatcher = new EnvHttpProxyAgent( { allowH2: false } );

export const cache = {
  content: null,
  expiresAt: 0
};

export const Freshness = {
  LIVE: 'live',
  CACHED: 'cached',
  STALE: 'stale',
  SNAPSHOT: 'snapshot'
};

export const state = {
  ignoreLiveRequestsUntil: 0
};

const parseData = data => {
  const map = new Map();
  try {
    for ( const [ providerId, provider ] of Object.entries( data ) ) {
      if ( providerId === '_meta' ) {
        continue;
      }
      for ( const [ modelName, { cost } ] of Object.entries( provider.models ?? {} ) ) {
        if ( cost ) { // some models don't have cost
          map.set( `${providerId}/${modelName}`, cost );
        }
      }
    }
    if ( map.size === 0 ) {
      throw new Error( 'Empty response' );
    }
    return map;
  } catch ( error ) {
    logger.error( `Models pricing: Data parsing failure "${error.message}".` );
    return null;
  }
};

const fallbackTable = parseData( modelsPricingSnapshot );

const fetchData = async () => {
  try {
    const res = await fetch( costTableUrl, { dispatcher } );
    if ( res.ok ) {
      return await res.json();
    } else {
      logger.error( `Models pricing: Data fetch HTTP error ${res.status}.` );
      return null;
    }
  } catch ( error ) {
    logger.error( `Models pricing: Data fetch failure "${error.code ?? error.name}".` );
    return null;
  }
};

export const fetchModelsPricing = async () => {
  if ( cache.content && cache.expiresAt > Date.now() ) {
    return { models: cache.content, freshness: Freshness.CACHED };
  }

  if ( state.ignoreLiveRequestsUntil < Date.now() ) {
    const table = await fetchData();
    const models = table ? parseData( table ) : null;

    if ( models ) {
      cache.content = models;
      cache.expiresAt = Date.now() + cacheTTL;
      return { models, freshness: Freshness.LIVE };
    } else {
      state.ignoreLiveRequestsUntil = Date.now() + cooldownTTL;
    }
  }

  if ( cache.content ) {
    logger.warn( 'Models pricing: using stale cache.' );
    return { models: cache.content, freshness: Freshness.STALE };
  }
  logger.warn( 'Models pricing: using built-in fallback.' );
  return { models: fallbackTable, freshness: Freshness.SNAPSHOT };
};
