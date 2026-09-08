import { Logger } from '@outputai/core';
import { EnvHttpProxyAgent, fetch } from 'undici';
import modelsPricingFallback from './models_pricing_fallback.json' with { type: 'json' };

const logger = Logger.createLogger( 'LLM' );
const costTableUrl = 'https://models.dev/api.json';
const cacheTTL = 1000 * 60 * 60 * 24; // 1 day

/* Ignore HTTP/2. Check: https://github.com/growthxai/output/issues/299 */
const dispatcher = new EnvHttpProxyAgent( { allowH2: false } );

export const cache = {
  content: null,
  expiresAt: 0
};

const parseData = data => {
  const map = new Map();
  try {
    for ( const [ providerId, provider ] of Object.entries( data ) ) {
      for ( const [ modelName, { cost } ] of Object.entries( provider.models ?? {} ) ) {
        if ( cost ) { // some models don't have cost
          map.set( `${providerId}/${modelName}`, cost );
        }
      }
    }
    return map;
  } catch ( error ) {
    logger.error( `Models pricing: Data parsing failure "${error.name}".` );
    return null;
  }
};

const fallbackTable = parseData( modelsPricingFallback );

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
    return cache.content;
  }

  const table = await fetchData();
  const content = table ? parseData( table ) : null;

  if ( content ) {
    cache.content = content;
    cache.expiresAt = Date.now() + cacheTTL;
    return content;
  }

  if ( cache.content ) {
    logger.warn( 'Models pricing: using stale cache.' );
    return cache.content;
  }

  logger.warn( 'Models pricing: using built-in fallback.' );
  return fallbackTable;
};
