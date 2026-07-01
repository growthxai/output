import { Logger } from '@outputai/core';
import { EnvHttpProxyAgent, fetch } from 'undici';

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

export const fetchModelsPricing = async () => {
  if ( cache.content && cache.expiresAt > Date.now() ) {
    return cache.content;
  }
  const res = await fetch( costTableUrl, { dispatcher } );
  if ( !res.ok ) {
    if ( cache.content ) {
      Logger.warn( `Error ${res.status} when fetching models pricing at ${costTableUrl}, falling back to stale cache`, { namespace: 'LLM' } );
      return cache.content;
    }
    Logger.error( `Error ${res.status} when fetching models pricing at ${costTableUrl}`, { namespace: 'LLM' } );
    return null;
  }
  cache.content = buildModelMap( await res.json() );
  cache.expiresAt = Date.now() + cacheTTL;
  return cache.content;
};
