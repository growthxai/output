import { describe, it, expect } from 'vitest';
import { extractSourcesFromSteps } from './source_extraction.js';

describe( 'extractSourcesFromSteps', () => {
  it( 'returns empty array for undefined/null/empty steps', () => {
    expect( extractSourcesFromSteps( undefined ) ).toEqual( [] );
    expect( extractSourcesFromSteps( null ) ).toEqual( [] );
    expect( extractSourcesFromSteps( [] ) ).toEqual( [] );
  } );

  it( 'skips steps with no toolResults', () => {
    const steps = [ { text: 'hello' } ];
    expect( extractSourcesFromSteps( steps ) ).toEqual( [] );
  } );

  it( 'skips non-search tool results', () => {
    const steps = [ {
      toolResults: [ {
        output: { answer: 'some text', confidence: 0.9 }
      } ]
    } ];
    expect( extractSourcesFromSteps( steps ) ).toEqual( [] );
  } );

  it( 'skips tool results with empty results array', () => {
    const steps = [ {
      toolResults: [ { output: { results: [] } } ]
    } ];
    expect( extractSourcesFromSteps( steps ) ).toEqual( [] );
  } );

  it( 'skips tool results where results items lack url', () => {
    const steps = [ {
      toolResults: [ {
        output: { results: [ { title: 'no url', content: 'text' } ] }
      } ]
    } ];
    expect( extractSourcesFromSteps( steps ) ).toEqual( [] );
  } );

  it( 'extracts from perplexity-shaped results', () => {
    const steps = [ {
      toolResults: [ {
        output: {
          id: 'pplx-123',
          results: [
            { url: 'https://example.com/1', title: 'Example 1', snippet: 'text' },
            { url: 'https://example.com/2', title: 'Example 2', snippet: 'text' }
          ]
        }
      } ]
    } ];

    const sources = extractSourcesFromSteps( steps );
    expect( sources ).toHaveLength( 2 );
    expect( sources[0] ).toEqual( {
      type: 'source',
      sourceType: 'url',
      id: expect.any( String ),
      url: 'https://example.com/1',
      title: 'Example 1'
    } );
    expect( sources[1].url ).toBe( 'https://example.com/2' );
  } );

  it( 'extracts from tavily-shaped results', () => {
    const steps = [ {
      toolResults: [ {
        output: {
          query: 'test query',
          results: [
            { url: 'https://tavily.com/a', title: 'Tavily A', content: 'stuff', score: 0.95 }
          ]
        }
      } ]
    } ];

    const sources = extractSourcesFromSteps( steps );
    expect( sources ).toHaveLength( 1 );
    expect( sources[0].url ).toBe( 'https://tavily.com/a' );
    expect( sources[0].title ).toBe( 'Tavily A' );
  } );

  it( 'extracts from exa-shaped results', () => {
    const steps = [ {
      toolResults: [ {
        output: {
          results: [
            { url: 'https://exa.ai/r', title: 'Exa Result', text: 'content', summary: 'summary' }
          ]
        }
      } ]
    } ];

    const sources = extractSourcesFromSteps( steps );
    expect( sources ).toHaveLength( 1 );
    expect( sources[0].url ).toBe( 'https://exa.ai/r' );
    expect( sources[0].title ).toBe( 'Exa Result' );
  } );

  it( 'deduplicates by URL across multiple steps', () => {
    const steps = [
      {
        toolResults: [ {
          output: { results: [ { url: 'https://dup.com', title: 'First' } ] }
        } ]
      },
      {
        toolResults: [ {
          output: { results: [ { url: 'https://dup.com', title: 'Second' } ] }
        } ]
      }
    ];

    const sources = extractSourcesFromSteps( steps );
    expect( sources ).toHaveLength( 1 );
    expect( sources[0].title ).toBe( 'First' );
  } );

  it( 'deduplicates by URL within the same step', () => {
    const steps = [ {
      toolResults: [
        { output: { results: [ { url: 'https://same.com', title: 'A' } ] } },
        { output: { results: [ { url: 'https://same.com', title: 'B' } ] } }
      ]
    } ];

    const sources = extractSourcesFromSteps( steps );
    expect( sources ).toHaveLength( 1 );
  } );

  it( 'handles mixed search and non-search tool results', () => {
    const steps = [ {
      toolResults: [
        { output: { calculation: 42 } },
        { output: { results: [ { url: 'https://real.com', title: 'Real' } ] } },
        { output: 'plain string' }
      ]
    } ];

    const sources = extractSourcesFromSteps( steps );
    expect( sources ).toHaveLength( 1 );
    expect( sources[0].url ).toBe( 'https://real.com' );
  } );

  it( 'defaults title to empty string when missing', () => {
    const steps = [ {
      toolResults: [ {
        output: { results: [ { url: 'https://notitle.com' } ] }
      } ]
    } ];

    const sources = extractSourcesFromSteps( steps );
    expect( sources[0].title ).toBe( '' );
  } );

  it( 'generates deterministic id from URL', () => {
    const steps = [ {
      toolResults: [ {
        output: { results: [ { url: 'https://stable.com/path', title: 'S' } ] }
      } ]
    } ];

    const s1 = extractSourcesFromSteps( steps );
    const s2 = extractSourcesFromSteps( steps );
    expect( s1[0].id ).toBe( s2[0].id );
    expect( s1[0].id ).toHaveLength( 16 );
  } );
} );
