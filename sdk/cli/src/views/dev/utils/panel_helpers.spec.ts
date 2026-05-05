import { describe, expect, it } from 'vitest';
import { truncate, formatStartedShort, computeWindowStart } from './panel_helpers.js';

describe( 'truncate', () => {
  it( 'returns the input unchanged when shorter than max', () => {
    expect( truncate( 'short', 10 ) ).toBe( 'short' );
  } );

  it( 'returns the input unchanged when exactly equal to max', () => {
    expect( truncate( 'abcde', 5 ) ).toBe( 'abcde' );
  } );

  it( 'replaces the last character with an ellipsis when too long', () => {
    expect( truncate( 'abcdefgh', 5 ) ).toBe( 'abcd…' );
  } );

  it( 'handles empty input', () => {
    expect( truncate( '', 4 ) ).toBe( '' );
  } );
} );

describe( 'formatStartedShort', () => {
  it( 'returns `-` when the input is undefined', () => {
    expect( formatStartedShort( undefined ) ).toBe( '-' );
  } );

  it( 'returns `-` when the input is empty', () => {
    expect( formatStartedShort( '' ) ).toBe( '-' );
  } );

  it( 'returns `-` when the input is unparseable', () => {
    expect( formatStartedShort( 'not-an-iso' ) ).toBe( '-' );
  } );

  it( 'formats a valid ISO timestamp into `MMM d HH:mm`', () => {
    expect( formatStartedShort( '2026-04-28T18:56:53Z' ) ).toMatch( /^Apr 28 \d{2}:\d{2}$/ );
  } );
} );

describe( 'computeWindowStart', () => {
  it( 'centres the selected row in the viewport when possible', () => {
    expect( computeWindowStart( 10, 30, 8 ) ).toBe( 6 );
  } );

  it( 'clamps to 0 when the selected row is near the top', () => {
    expect( computeWindowStart( 1, 30, 8 ) ).toBe( 0 );
  } );

  it( 'clamps so the window never runs off the end', () => {
    expect( computeWindowStart( 28, 30, 8 ) ).toBe( 22 );
  } );

  it( 'returns 0 when the list is shorter than the viewport', () => {
    expect( computeWindowStart( 2, 5, 8 ) ).toBe( 0 );
  } );

  it( 'returns 0 for an empty list', () => {
    expect( computeWindowStart( 0, 0, 8 ) ).toBe( 0 );
  } );
} );
