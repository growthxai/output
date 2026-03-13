const costTableUrl = 'https://models.dev/api.json';
const cacheTTL = 1000 * 60 * 60 * 24; // 1 day

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
  const res = await fetch( costTableUrl );
  if ( !res.ok ) {
    if ( cache.content ) {
      console.warn( `Error ${res.status} when fetching models pricing at ${costTableUrl}, falling back to stale cache` );
      return cache.content;
    }
    console.error( `Error ${res.status} when fetching models pricing at ${costTableUrl}` );
    return null;
  }
  cache.content = buildModelMap( await res.json() );
  cache.expiresAt = Date.now() + cacheTTL;
  return cache.content;
};
