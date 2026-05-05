import { describe, expect, it } from 'vitest';
import { tokenizeLine, formatJsonText, countJsonLines } from './json_render.js';

describe( 'tokenizeLine', () => {
  it( 'classifies an object key (followed by colon) as a key', () => {
    const tokens = tokenizeLine( '  "name": "ada"' );
    const key = tokens.find( t => t.text === '"name"' );
    const value = tokens.find( t => t.text === '"ada"' );
    expect( key?.color ).toBe( 'cyan' );
    expect( value?.color ).toBe( 'green' );
  } );

  it( 'classifies a numeric value', () => {
    const tokens = tokenizeLine( '  "age": 42' );
    const num = tokens.find( t => t.text === '42' );
    expect( num?.color ).toBe( 'yellow' );
  } );

  it( 'classifies booleans as magenta', () => {
    const tokens = tokenizeLine( '  "active": true' );
    expect( tokens.find( t => t.text === 'true' )?.color ).toBe( 'magenta' );
  } );

  it( 'classifies null as red', () => {
    const tokens = tokenizeLine( '  "owner": null' );
    expect( tokens.find( t => t.text === 'null' )?.color ).toBe( 'red' );
  } );

  it( 'colours punctuation gray', () => {
    const tokens = tokenizeLine( '{},[]:' );
    for ( const t of tokens ) {
      expect( t.color ).toBe( 'gray' );
    }
  } );

  it( 'preserves whitespace tokens with no colour', () => {
    const tokens = tokenizeLine( '   "x"' );
    const ws = tokens.find( t => /^\s+$/.test( t.text ) );
    expect( ws?.color ).toBeUndefined();
  } );

  it( 'handles escaped quotes inside strings', () => {
    const tokens = tokenizeLine( '  "msg": "she said \\"hi\\""' );
    const value = tokens.find( t => t.text.includes( 'hi' ) );
    expect( value?.color ).toBe( 'green' );
  } );
} );

describe( 'formatJsonText', () => {
  it( 'returns an empty string for null', () => {
    expect( formatJsonText( null ) ).toBe( '' );
  } );

  it( 'returns an empty string for undefined', () => {
    expect( formatJsonText( undefined ) ).toBe( '' );
  } );

  it( 'pretty-prints with two-space indent', () => {
    expect( formatJsonText( { a: 1 } ) ).toBe( '{\n  "a": 1\n}' );
  } );

  it( 'falls back to String() when stringify throws', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect( formatJsonText( cyclic ) ).toBe( String( cyclic ) );
  } );
} );

describe( 'countJsonLines', () => {
  it( 'returns 0 for nullish input', () => {
    expect( countJsonLines( null ) ).toBe( 0 );
    expect( countJsonLines( undefined ) ).toBe( 0 );
  } );

  it( 'counts lines in pretty-printed output', () => {
    expect( countJsonLines( { a: 1, b: 2 } ) ).toBe( 4 );
  } );
} );
