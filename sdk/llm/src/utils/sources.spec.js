import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { extractSources } from './sources.js';

const hashedId = url => createHash( 'sha256' ).update( url ).digest( 'hex' ).slice( 0, 16 );

const fromSteps = ( steps, sources = [] ) => extractSources( { steps, sources } );

const searchStep = results => ( {
  toolResults: [ { output: { results } } ]
} );

describe( 'extractSources', () => {
  it( 'returns empty when steps and sources are missing or empty', () => {
    expect( extractSources( {} ) ).toEqual( [] );
    expect( fromSteps( undefined ) ).toEqual( [] );
    expect( fromSteps( null ) ).toEqual( [] );
    expect( fromSteps( [] ) ).toEqual( [] );
    expect( fromSteps( [ { text: 'hello' } ] ) ).toEqual( [] );
  } );

  it( 'treats non-array response sources as empty', () => {
    const steps = [ searchStep( [ { url: 'https://u.test', title: 'T' } ] ) ];
    expect( extractSources( { steps, sources: undefined } ) ).toHaveLength( 1 );
    expect( extractSources( { steps, sources: {} } ) ).toHaveLength( 1 );
  } );

  it( 'skips tool results that are not a results array with urls', () => {
    const steps = [ {
      toolResults: [
        { output: { answer: 'some text' } },
        { output: { results: [] } },
        { output: { results: [ { title: 'no url' } ] } },
        { output: { results: [ { url: '   ' } ] } },
        { output: 'plain string' }
      ]
    } ];
    expect( fromSteps( steps ) ).toEqual( [] );
  } );

  it( 'extracts url and title from search-shaped results', () => {
    const sources = fromSteps( [ searchStep( [
      { url: 'https://example.com/1', title: 'Example 1', snippet: 'text' },
      { url: 'https://example.com/2', title: 'Example 2' }
    ] ) ] );

    expect( sources ).toHaveLength( 2 );
    expect( sources[0] ).toEqual( {
      type: 'source',
      sourceType: 'url',
      id: hashedId( 'https://example.com/1' ),
      url: 'https://example.com/1',
      title: 'Example 1'
    } );
    expect( sources[1].url ).toBe( 'https://example.com/2' );
  } );

  it( 'keeps the last tool hit when urls repeat', () => {
    const steps = [
      searchStep( [ { url: 'https://dup.com', title: 'First' } ] ),
      searchStep( [ { url: 'https://dup.com', title: 'Second' } ] )
    ];
    const sources = fromSteps( steps );
    expect( sources ).toHaveLength( 1 );
    expect( sources[0].title ).toBe( 'Second' );
  } );

  it( 'keeps a search hit among mixed tool results', () => {
    const steps = [ {
      toolResults: [
        { output: { calculation: 42 } },
        { output: { results: [ { url: 'https://real.com', title: 'Real' } ] } },
        { output: 'plain string' }
      ]
    } ];
    const sources = fromSteps( steps );
    expect( sources ).toHaveLength( 1 );
    expect( sources[0].url ).toBe( 'https://real.com' );
  } );

  it( 'defaults title to empty string when missing', () => {
    expect( fromSteps( [ searchStep( [ { url: 'https://notitle.com' } ] ) ] )[0].title ).toBe( '' );
  } );

  it( 'trims urls for storage and id', () => {
    const sources = fromSteps( [ searchStep( [ { url: '  https://stable.com/path  ', title: 'S' } ] ) ] );
    expect( sources[0].url ).toBe( 'https://stable.com/path' );
    expect( sources[0].id ).toBe( hashedId( 'https://stable.com/path' ) );
    expect( sources[0].id ).toHaveLength( 16 );
  } );

  it( 'lets response sources win on the same url', () => {
    const url = 'https://shared.test';
    const sources = extractSources( {
      steps: [ searchStep( [ { url, title: 'from-tool' } ] ) ],
      sources: [ { url, title: 'from-response', type: 'source', sourceType: 'url', id: 'b' } ]
    } );

    expect( sources ).toHaveLength( 1 );
    expect( sources[0].title ).toBe( 'from-response' );
  } );
} );
