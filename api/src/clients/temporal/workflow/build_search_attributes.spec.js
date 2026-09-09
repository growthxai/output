import { describe, it, expect } from 'vitest';
import { buildSearchAttributes } from './build_search_attributes.js';

describe( 'buildSearchAttributes', () => {
  it( 'returns a WorkspaceId search attribute when input has a workspaceId', () => {
    expect( buildSearchAttributes( { workspaceId: 'abc-123' } ) ).toEqual( {
      searchAttributes: { WorkspaceId: [ 'abc-123' ] }
    } );
  } );

  it( 'does not mutate the input', () => {
    const input = { workspaceId: 'abc-123' };
    buildSearchAttributes( input );
    expect( input ).toEqual( { workspaceId: 'abc-123' } );
  } );

  it.each( [
    [ 'missing workspaceId', { value: 1 } ],
    [ 'null input', null ],
    [ 'string input', 'input' ],
    [ 'array input', [ 'workspaceId' ] ],
    [ 'non-string workspaceId', { workspaceId: 123 } ],
    [ 'empty string workspaceId', { workspaceId: '' } ]
  ] )( 'returns an empty object for %s', ( _, input ) => {
    expect( buildSearchAttributes( input ) ).toEqual( {} );
  } );
} );
