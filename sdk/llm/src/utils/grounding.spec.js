import { describe, expect, it } from 'vitest';
import googleVertexText from '../fixtures/text_response_v7_google_vertex.js';
import { GROUNDING_PPM, GROUNDING_UNKNOWN_LABEL, parseGroundingUsage } from './grounding.js';

const metadata = ( key, webSearchQueries ) => ( {
  [key]: { groundingMetadata: { webSearchQueries } }
} );

describe( 'GROUNDING_PPM', () => {
  it( 'prices both billing units per million', () => {
    expect( GROUNDING_PPM ).toEqual( {
      grounding_query: 14_000,
      grounding_prompt: 35_000
    } );
  } );
} );

describe( 'parseGroundingUsage', () => {
  it( 'counts one query per web search on Gemini 3', () => {
    expect( parseGroundingUsage( 'gemini-3.1-flash-lite', metadata( 'vertex', [ 'a', 'b', 'c' ] ) ) ).toEqual( {
      label: 'grounding_query',
      amount: 3
    } );
  } );

  it( 'charges Gemini 2 once per prompt regardless of query count', () => {
    expect( parseGroundingUsage( 'gemini-2.5-flash', metadata( 'vertex', [ 'a', 'b', 'c' ] ) ) ).toEqual( {
      label: 'grounding_prompt',
      amount: 1
    } );
  } );

  it( 'reads the google provider metadata key', () => {
    expect( parseGroundingUsage( 'gemini-3-pro', metadata( 'google', [ 'a' ] ) ) ).toEqual( {
      label: 'grounding_query',
      amount: 1
    } );
  } );

  it( 'records an unpriced quantity for an unknown model family', () => {
    expect( parseGroundingUsage( 'claude-haiku-4-5', metadata( 'vertex', [ 'a', 'b' ] ) ) ).toEqual( {
      label: GROUNDING_UNKNOWN_LABEL,
      amount: 2
    } );
  } );

  it( 'reads grounding from a Vertex response fixture', () => {
    expect( parseGroundingUsage( 'gemini-2.5-flash', googleVertexText.finalStep.providerMetadata ) ).toEqual( {
      label: 'grounding_prompt',
      amount: 1
    } );
  } );

  it.each( [
    { name: 'no provider metadata', modelId: 'gemini-3-pro', metadata: undefined },
    { name: 'a non-google provider', modelId: 'gemini-3-pro', metadata: { anthropic: {} } },
    { name: 'null grounding metadata', modelId: 'gemini-3-pro', metadata: { vertex: { groundingMetadata: null } } },
    { name: 'no web search queries', modelId: 'gemini-3-pro', metadata: { vertex: { groundingMetadata: {} } } },
    { name: 'an empty query list', modelId: 'gemini-3-pro', metadata: metadata( 'vertex', [] ) }
  ] )( 'returns null for $name', ( { modelId, metadata: providerMetadata } ) => {
    expect( parseGroundingUsage( modelId, providerMetadata ) ).toBeNull();
  } );
} );
