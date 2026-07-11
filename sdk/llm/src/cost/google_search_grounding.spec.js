import { describe, expect, it } from 'vitest';
import { getGoogleSearchGroundingUsage } from './google_search_grounding.js';

describe( 'getGoogleSearchGroundingUsage', () => {
  it( 'prices Gemini 3 Vertex search queries at $14 per 1K queries', () => {
    expect( getGoogleSearchGroundingUsage( {
      modelId: 'gemini-3.5-flash',
      providerMetadata: {
        vertex: { groundingMetadata: { webSearchQueries: [ 'one', 'two' ] } }
      }
    } ) ).toEqual( {
      type: 'google_search_grounding',
      unit: 'query',
      ppm: 14_000,
      amount: 2
    } );
  } );

  it( 'sums per-step queries without double-counting top-level metadata', () => {
    expect( getGoogleSearchGroundingUsage( {
      modelId: 'google/gemini-3.5-flash',
      providerMetadata: {
        google: { groundingMetadata: { webSearchQueries: [ 'duplicated top-level' ] } }
      },
      steps: [
        { providerMetadata: { google: { groundingMetadata: { webSearchQueries: [ 'one', 'two' ] } } } },
        { providerMetadata: { google: { groundingMetadata: { webSearchQueries: [ 'three' ] } } } }
      ]
    } ) ).toEqual( expect.objectContaining( { amount: 3 } ) );
  } );

  it( 'does not apply Gemini 3 query pricing to older model families', () => {
    expect( getGoogleSearchGroundingUsage( {
      modelId: 'gemini-2.5-flash',
      providerMetadata: {
        vertex: { groundingMetadata: { webSearchQueries: [ 'one' ] } }
      }
    } ) ).toBeNull();
  } );

  it( 'returns null when grounding metadata is missing or explicitly empty', () => {
    expect( getGoogleSearchGroundingUsage( {
      modelId: 'gemini-3.5-flash',
      providerMetadata: { vertex: {} }
    } ) ).toBeNull();
    expect( getGoogleSearchGroundingUsage( {
      modelId: 'gemini-3.5-flash',
      providerMetadata: { vertex: { groundingMetadata: { webSearchQueries: [] } } }
    } ) ).toBeNull();
  } );
} );
