import { describe, expect, it } from 'vitest';
import { cursorToPosition, positionToCursor, tryParseJson } from './json_editor.js';

describe( 'cursorToPosition', () => {
  it( 'returns line 0 col 0 for an empty buffer', () => {
    expect( cursorToPosition( '', 0 ) ).toEqual( { line: 0, col: 0 } );
  } );

  it( 'tracks column on a single-line buffer', () => {
    expect( cursorToPosition( 'hello', 3 ) ).toEqual( { line: 0, col: 3 } );
  } );

  it( 'crosses newline boundaries', () => {
    // 'ab\ncd' — cursor 3 is just before `c` on line 1
    expect( cursorToPosition( 'ab\ncd', 3 ) ).toEqual( { line: 1, col: 0 } );
  } );

  it( 'lands at the end of a line', () => {
    expect( cursorToPosition( 'ab\ncd', 5 ) ).toEqual( { line: 1, col: 2 } );
  } );
} );

describe( 'positionToCursor', () => {
  it( 'returns 0 for an empty buffer', () => {
    expect( positionToCursor( '', 0, 0 ) ).toBe( 0 );
  } );

  it( 'computes index for a column on a given line', () => {
    expect( positionToCursor( 'ab\ncd', 1, 1 ) ).toBe( 4 );
  } );

  it( 'clamps the column to the line length', () => {
    expect( positionToCursor( 'ab\ncd', 0, 99 ) ).toBe( 2 );
  } );

  it( 'clamps to the last line when over-shooting', () => {
    expect( positionToCursor( 'ab\ncd', 99, 0 ) ).toBe( 3 );
  } );

  it( 'clamps to the first line when under-shooting', () => {
    expect( positionToCursor( 'ab\ncd', -5, 1 ) ).toBe( 1 );
  } );

  it( 'roundtrips with cursorToPosition', () => {
    const buffer = 'foo\nbar\nbaz';
    for ( const cursor of [ 0, 2, 4, 7, 10 ] ) {
      const pos = cursorToPosition( buffer, cursor );
      expect( positionToCursor( buffer, pos.line, pos.col ) ).toBe( cursor );
    }
  } );
} );

describe( 'tryParseJson', () => {
  it( 'rejects empty input', () => {
    expect( tryParseJson( '' ) ).toEqual( { ok: false, error: 'Empty' } );
    expect( tryParseJson( '   \n  ' ) ).toEqual( { ok: false, error: 'Empty' } );
  } );

  it( 'accepts valid JSON', () => {
    expect( tryParseJson( '{"a":1}' ) ).toEqual( { ok: true } );
  } );

  it( 'returns the parser error for invalid JSON', () => {
    const result = tryParseJson( '{a:1}' );
    expect( result.ok ).toBe( false );
    if ( !result.ok ) {
      expect( result.error.length ).toBeGreaterThan( 0 );
    }
  } );
} );
