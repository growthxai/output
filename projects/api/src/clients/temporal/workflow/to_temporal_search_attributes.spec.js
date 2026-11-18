import { describe, it, expect } from 'vitest';
import { toTemporalSearchAttributes } from './to_temporal_search_attributes.js';

describe( 'toTemporalSearchAttributes', () => {
  it( 'returns an empty object when search attributes are undefined', () => {
    expect( toTemporalSearchAttributes( undefined ) ).toEqual( {} );
  } );

  it( 'returns an empty object for an empty map', () => {
    expect( toTemporalSearchAttributes( {} ) ).toEqual( {} );
  } );

  it( 'wraps scalar values in single-element arrays', () => {
    expect( toTemporalSearchAttributes( { ClientId: 'abc', Priority: 5, Urgent: false } ) ).toEqual( {
      searchAttributes: { ClientId: [ 'abc' ], Priority: [ 5 ], Urgent: [ false ] }
    } );
  } );

  it( 'passes string arrays through unchanged', () => {
    expect( toTemporalSearchAttributes( { Tags: [ 'a', 'b' ] } ) ).toEqual( {
      searchAttributes: { Tags: [ 'a', 'b' ] }
    } );
  } );
} );
