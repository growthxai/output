import { Logger } from '@outputai/core';
import { EnvHttpProxyAgent, fetch } from 'undici';

const logger = Logger.createLogger( 'LLM' );
const costTableUrl = 'https://models.dev/api.json';
const cacheTTL = 1000 * 60 * 60 * 24; // 1 day
const failureBackoffTTL = 1000 * 60; // 1 minute — negative-cache window after a failed fetch

/* Ignore HTTP/2. Check: https://github.com/growthxai/output/issues/299 */
const dispatcher = new EnvHttpProxyAgent( { allowH2: false } );

export const cache = {
  content: null,
  limits: null,
  expiresAt: 0
};

const buildModelMaps = data => {
  const costs = new Map();
  const limits = new Map();
  // fetchModelsPricing validates `data` is a non-null object before calling; the inner
  // guards below still cover malformed nested providers/models.
  for ( const provider of Object.values( data ) ) {
    for ( const [ modelName, model ] of Object.entries( provider?.models ?? {} ) ) {
      const keys = [ modelName, `${provider.id}/${modelName}` ];
      if ( model?.cost ) { // some models don't have cost
        for ( const key of keys ) {
          costs.set( key, model.cost );
        }
      }
      const outputLimit = model?.limit?.output;
      if ( Number.isFinite( outputLimit ) && outputLimit > 0 ) {
        for ( const key of keys ) {
          limits.set( key, outputLimit );
        }
      }
    }
  }
  return { costs, limits };
};

const buildErrorMessage = cause => `Error "${cause}" when fetching models pricing at ${costTableUrl}`;

export const fetchModelsPricing = async () => {
  // A future expiry covers a fresh success, a stale-serve window, and a negative-cache
  // window after a failure; in every case skip the fetch and return whatever is cached
  // (which may be null during a negative-cache window).
  if ( cache.expiresAt > Date.now() ) {
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

  if ( !state.errorMessage && ( state.table === null || typeof state.table !== 'object' ) ) {
    state.errorMessage = buildErrorMessage( 'malformed response body' );
  }

  if ( state.errorMessage ) {
    // Back off before retrying so a persistent outage does not trigger a fetch on every
    // resolve/warm; serve stale content within the window if we have any.
    cache.expiresAt = Date.now() + failureBackoffTTL;
    if ( cache.content ) {
      logger.warn( state.errorMessage + ', falling back to stale cache' );
      return cache.content;
    }
    logger.error( state.errorMessage );
    return null;
  }

  const { costs, limits } = buildModelMaps( state.table );
  cache.content = costs;
  cache.limits = limits;
  cache.expiresAt = Date.now() + cacheTTL;
  return cache.content;
};

const warmState = { promise: null };

/**
 * Trigger a background refresh of the models table without awaiting it. Called by
 * resolveModelMaxOutputTokens when the cache is cold/stale so the table warms for
 * subsequent calls; the resolve itself is synchronous, so the first call on a cold cache
 * is best-effort and self-heals from the next call. Concurrent invocations share one
 * in-flight fetch.
 */
export const warmModelsPricing = () => {
  if ( !warmState.promise ) {
    warmState.promise = fetchModelsPricing()
      .catch( () => null )
      .finally( () => {
        warmState.promise = null;
      } );
  }
  return warmState.promise;
};

/**
 * Resolve a model's max output token limit synchronously from the cached models.dev
 * table. Sourcing the ceiling here (rather than relying on the AI SDK provider's
 * per-model fallback) prevents the silent 4096 cap for models the provider build does
 * not yet recognize: models.dev tracks new models faster, and when the provider treats
 * a model as unknown it does NOT clamp, so the injected limit is authoritative.
 *
 * @param {object} config
 * @param {string} config.provider - Provider id, e.g. "anthropic"
 * @param {string} config.model - Model id
 * @returns {{ status: 'known'|'unknown'|'cold', maxOutputTokens: number|null }}
 *   `known` when a limit was found; `unknown` when a fresh table has no entry for the
 *   model; `cold` when the table is unfetched or stale (a background warm is triggered and
 *   the caller should not warn, since the model may appear once the refresh lands).
 */
export const resolveModelMaxOutputTokens = ( { provider, model } = {} ) => {
  const isStale = cache.expiresAt <= Date.now();
  if ( isStale ) {
    warmModelsPricing(); // refresh in the background; read stale limits below meanwhile
  }
  if ( !cache.limits ) {
    return { status: 'cold', maxOutputTokens: null };
  }
  const maxOutputTokens =
    cache.limits.get( `${provider}/${model}` ) ??
    cache.limits.get( model );
  if ( maxOutputTokens !== undefined ) {
    return { status: 'known', maxOutputTokens };
  }
  // Absent from the table. If the table is stale a refresh is in flight and the model may
  // appear once it lands, so report 'cold' (no warning) rather than a false 'unknown'.
  return { status: isStale ? 'cold' : 'unknown', maxOutputTokens: null };
};
