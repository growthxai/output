import { describe, expect, it } from 'vitest';
import { extractAttributes } from './attributes.js';

describe( 'extractAttributes', () => {
  it( 'returns no attributes for empty input', () => {
    expect( extractAttributes( '' ) ).toEqual( {} );
  } );

  it( 'returns no attributes for whitespace-only input', () => {
    expect( extractAttributes( ' \n\t ' ) ).toEqual( {} );
  } );

  it( 'parses bare attributes as true', () => {
    expect( extractAttributes( 'cached pinned' ) ).toEqual( {
      cached: true,
      pinned: true
    } );
  } );

  it( 'lowercases attribute names', () => {
    expect( extractAttributes( 'OPTIONS=cached PINNED' ) ).toEqual( {
      options: 'cached',
      pinned: true
    } );
  } );

  it( 'preserves unquoted values as strings', () => {
    expect( extractAttributes( 'enabled=false count=001 ratio=1.25' ) ).toEqual( {
      enabled: 'false',
      count: '001',
      ratio: '1.25'
    } );
  } );

  it( 'removes matching double quotes', () => {
    expect( extractAttributes( 'options="cached shared"' ) ).toEqual( {
      options: 'cached shared'
    } );
  } );

  it( 'removes matching single quotes', () => {
    expect( extractAttributes( 'options=\'cached shared\'' ) ).toEqual( {
      options: 'cached shared'
    } );
  } );

  it( 'allows the opposite quote type inside quoted values', () => {
    expect( extractAttributes( 'single="it\'s ready" double=\'say "ready"\'' ) ).toEqual( {
      single: 'it\'s ready',
      double: 'say "ready"'
    } );
  } );

  it( 'preserves equals and greater-than characters inside quoted values', () => {
    expect( extractAttributes( 'condition="score >= 10" expression=\'a = b\'' ) ).toEqual( {
      condition: 'score >= 10',
      expression: 'a = b'
    } );
  } );

  it( 'supports whitespace around equals signs', () => {
    expect( extractAttributes( 'options = "cached shared" mode = fast pinned' ) ).toEqual( {
      options: 'cached shared',
      mode: 'fast',
      pinned: true
    } );
  } );

  it( 'supports tabs and newlines between attributes', () => {
    expect( extractAttributes( 'options="cached"\nmode=fast\tpinned' ) ).toEqual( {
      options: 'cached',
      mode: 'fast',
      pinned: true
    } );
  } );

  it( 'ignores surrounding whitespace', () => {
    expect( extractAttributes( '  options = "cached" pinned  ' ) ).toEqual( {
      options: 'cached',
      pinned: true
    } );
  } );

  it( 'parses an explicitly empty value', () => {
    expect( extractAttributes( 'options=' ) ).toEqual( { options: '' } );
  } );

  it( 'uses the last value when an attribute is repeated', () => {
    expect( extractAttributes( 'mode=slow mode=fast' ) ).toEqual( { mode: 'fast' } );
  } );

  it( 'rejects an unterminated single-quoted value', () => {
    expect( () => extractAttributes( 'color=\'red' ) )
      .toThrow( /^Invalid attribute "color": quoted value is missing its closing quote \('\)\.$/ );
  } );

  it( 'rejects an unterminated double-quoted value', () => {
    expect( () => extractAttributes( 'color="red' ) )
      .toThrow( /^Invalid attribute "color": quoted value is missing its closing quote \("\)\.$/ );
  } );

  it( 'rejects values closed by a different quote type', () => {
    expect( () => extractAttributes( 'color=\'red"' ) ).toThrow();
    expect( () => extractAttributes( 'color="red\'' ) ).toThrow();
  } );

  it( 'rejects stray quotes in unquoted values', () => {
    expect( () => extractAttributes( 'color=red\'' ) ).toThrow();
    expect( () => extractAttributes( 'color=red"' ) ).toThrow();
    expect( () => extractAttributes( 'color=arby\'s' ) ).toThrow();
    expect( () => extractAttributes( 'color=jack"madman"silva' ) ).toThrow();
  } );

  it( 'rejects matching quote characters inside quoted values', () => {
    expect( () => extractAttributes( 'message="say "hello""' ) )
      .toThrow( /^Invalid attribute "message": quoted value contains an unexpected quote \("\)\.$/ );
    expect( () => extractAttributes( 'message=\'say \'hello\'\'' ) ).toThrow();
    expect( () => extractAttributes( 'color="red"dark"' ) ).toThrow();
    expect( () => extractAttributes( 'color=\'red\'dark\'' ) ).toThrow();
  } );

  it( 'rejects an empty attribute name', () => {
    expect( () => extractAttributes( '=value' ) )
      .toThrow( /^Invalid attribute "=value": name is missing\.$/ );
  } );

  it( 'rejects invalid valued and bare attribute names', () => {
    expect( () => extractAttributes( 'bad/name=value' ) )
      .toThrow( /^Invalid attribute name "bad\/name"\.$/ );
    expect( () => extractAttributes( 'bad/name' ) ).toThrow();
  } );
} );
