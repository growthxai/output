import modelsPricingSnapshot from './models_pricing_snapshot.json' with { type: 'json' };
import { parseModelsDevData } from './parser.js';
import { CacheFreshness } from '../consts.js';

const snapshot = parseModelsDevData( modelsPricingSnapshot );

const CACHE_TTL = 1000 * 60 * 60 * 24; // 1 day

const cache = {
  content: null,
  expiresAt: 0
};

export const update = content => {
  Object.assign( cache, {
    content,
    expiresAt: Date.now() + CACHE_TTL
  } );
};

export const getPricing = () => {
  if ( cache.content ) {
    const freshness = cache.expiresAt > Date.now() ? CacheFreshness.CACHED : CacheFreshness.STALE;
    return { models: cache.content, freshness };
  }

  return { models: snapshot, freshness: CacheFreshness.SNAPSHOT };
};
