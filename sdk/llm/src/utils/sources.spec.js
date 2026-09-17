import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted( () => ( {
  logger: { error: vi.fn() }
} ) );

vi.mock( '@outputai/core', () => ( {
  Logger: mocks.logger
} ) );

import { extractSources } from './sources.js';

const hashedId = url => createHash( 'sha256' ).update( url ).digest( 'hex' ).slice( 0, 16 );

const fromSteps = ( steps, sources = [] ) => extractSources( { steps, sources } );

const searchStep = results => ( {
  toolResults: [ { output: { results } } ]
} );

describe( 'extractSources', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

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

  it( 'keeps document sources that have id and no url', () => {
    const docA = { type: 'source', sourceType: 'document', id: 'doc-a', mediaType: 'application/pdf', title: 'A' };
    const docB = { type: 'source', sourceType: 'document', id: 'doc-b', mediaType: 'application/pdf', title: 'B' };

    expect( extractSources( { sources: [ docA, docB ] } ) ).toEqual( [ docA, docB ] );
  } );

  it( 'keeps url and document sources together', () => {
    const url = 'https://page.test';
    const doc = { type: 'source', sourceType: 'document', id: 'doc-1', title: 'Doc' };
    const sources = extractSources( {
      steps: [ searchStep( [ { url, title: 'from-tool' } ] ) ],
      sources: [ doc ]
    } );

    expect( sources ).toHaveLength( 2 );
    expect( sources[0].url ).toBe( url );
    expect( sources[1] ).toEqual( doc );
  } );

  it( 'drops response sources that carry neither a url nor an id', () => {
    const sources = [ null, undefined, 'https://string.test', 42, [], { title: 'no keys' }, { url: 5 } ];

    expect( extractSources( { sources } ) ).toEqual( [] );
  } );

  it( 'keeps blank-url sources under their id instead of collapsing them', () => {
    const sources = [
      { type: 'source', sourceType: 'document', id: 'doc-a', url: '', title: 'A' },
      { type: 'source', sourceType: 'document', id: 'doc-b', url: '   ', title: 'B' }
    ];
    const result = extractSources( { sources } );

    expect( result.map( s => s.id ) ).toEqual( [ 'doc-a', 'doc-b' ] );
    expect( result.every( s => !( 'url' in s ) ) ).toBe( true );
  } );

  it( 'trims response urls so they dedupe against tool hits', () => {
    const url = 'https://shared.test';
    const result = extractSources( {
      steps: [ searchStep( [ { url, title: 'from-tool' } ] ) ],
      sources: [ { type: 'source', sourceType: 'url', id: 'b', url: `  ${url}  `, title: 'from-response' } ]
    } );

    expect( result ).toHaveLength( 1 );
    expect( result[0].url ).toBe( url );
    expect( result[0].title ).toBe( 'from-response' );
  } );

  it( 'logs and returns no sources when reading the response throws', () => {
    const response = {
      get steps() {
        throw new Error( 'steps exploded' );
      }
    };

    expect( extractSources( response ) ).toEqual( [] );
    expect( mocks.logger.error ).toHaveBeenCalledWith(
      'Sources extraction failed',
      expect.objectContaining( { namespace: 'LLM', error: 'steps exploded' } )
    );
  } );

  it( 'logs and returns no sources when a source getter throws', () => {
    const sources = [ {
      type: 'source',
      get url() {
        throw new Error( 'url exploded' );
      }
    } ];

    expect( extractSources( { sources } ) ).toEqual( [] );
    expect( mocks.logger.error ).toHaveBeenCalledOnce();
  } );
} );
