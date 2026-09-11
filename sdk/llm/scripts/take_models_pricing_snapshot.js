#!/usr/bin/env node
/**
 * - Takes a snapshot from the models.dev
 * - Removes providers other than those that the LLM natively supports
 * - Strip fields other then "cost"
 * - Write to a file
 */

import { writeFileSync } from 'node:fs';

const url = 'https://models.dev/api.json';
const timeout = 1000 * 60; // 1 minute

const target = new URL( '../src/utils/models_pricing_snapshot.json', import.meta.url ).pathname;

// Order maters, keep in alphabetical order
export const supportedProviders = [
  'amazon-bedrock',
  'anthropic',
  'azure',
  'google-vertex',
  'openai',
  'perplexity'
];

/**
 * Reduces a models.dev payload to $.<provider_id>.models.<model_id>.cost, in alphabetical order.
 * @param {object} src Parsed models.dev payload.
 * @returns {object} Snapshot content, `_meta` first.
 * @throws {Error} When a supported provider is absent or has no priced models.
 */
export const buildPricing = src => {
  const pricing = {
    _meta: { createdAt: new Date().toISOString() }
  };

  for ( const providerId of supportedProviders ) {
    if ( !src[providerId] ) {
      throw new Error( `Source does not have required provider ${providerId}.` );
    }

    const models = Object.entries( src[providerId].models ?? {} )
      .sort( ( [ a ], [ b ] ) => ( a < b ? -1 : 1 ) ) // alpha sort models
      .reduce( ( o, [ modelId, { cost } ] ) =>
        cost ? Object.assign( o, { [modelId]: { cost } } ) : o
      , {} );

    if ( Object.keys( models ).length === 0 ) {
      throw new Error( `Provider ${providerId} has no models with pricing.` );
    }
    pricing[providerId] = { models };
  }

  return pricing;
};

/**
 * Fetches the live catalog and overwrites the bundled snapshot.
 * @throws {Error} When the fetch fails or the payload is unusable.
 */
export const takeSnapshot = async () => {
  const res = await fetch( url, { signal: AbortSignal.timeout( timeout ) } );
  if ( !res.ok ) {
    throw new Error( `Data fetch HTTP error ${res.status}.` );
  }

  const pricing = buildPricing( await res.json() );
  writeFileSync( target, JSON.stringify( pricing, undefined, 2 ) + '\n', 'utf-8' );
};

if ( import.meta.main ) {
  await takeSnapshot();
}
