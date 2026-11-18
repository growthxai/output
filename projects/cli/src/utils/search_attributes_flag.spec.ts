import { describe, it, expect } from 'vitest';
import { parseSearchAttributesFlag } from './search_attributes_flag.js';

describe( 'parseSearchAttributesFlag', () => {
  it( 'returns undefined when the flag is not set', () => {
    expect( parseSearchAttributesFlag( undefined ) ).toBeUndefined();
  } );

  it( 'parses a JSON object of scalars and string arrays', () => {
    const flag = '{"ClientId":"acme","Priority":5,"Active":true,"Tags":["sales","emea"]}';
    expect( parseSearchAttributesFlag( flag ) ).toEqual( {
      ClientId: 'acme',
      Priority: 5,
      Active: true,
      Tags: [ 'sales', 'emea' ]
    } );
  } );

  it( 'accepts an empty object', () => {
    expect( parseSearchAttributesFlag( '{}' ) ).toEqual( {} );
  } );

  it.each( [
    [ 'an array', '["acme"]' ],
    [ 'a string', '"acme"' ],
    [ 'null', 'null' ],
    [ 'a number', '5' ]
  ] )( 'rejects %s', ( _, flag ) => {
    expect( () => parseSearchAttributesFlag( flag ) ).toThrow( '--search-attributes must be a JSON object' );
  } );

  it.each( [
    [ 'an object value', '{"ClientId":{"id":1}}' ],
    [ 'a null value', '{"ClientId":null}' ],
    [ 'a number array', '{"Tags":[1,2]}' ],
    [ 'a mixed array', '{"Tags":["a",1]}' ]
  ] )( 'rejects %s', ( _, flag ) => {
    expect( () => parseSearchAttributesFlag( flag ) ).toThrow( 'must be a string, number, boolean, or array of strings' );
  } );

  it( 'reports invalid JSON', () => {
    expect( () => parseSearchAttributesFlag( '{not json' ) ).toThrow( /^--search-attributes: (Invalid JSON input|Input file not found)/ );
  } );
} );
