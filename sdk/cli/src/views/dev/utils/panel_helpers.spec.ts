import { describe, expect, it } from 'vitest';
import {
  capitalize,
  clampIndex,
  computeWindowStart,
  cycleValue,
  formatContentTitle,
  formatStartedShort,
  hasJsonValue,
  truncate
} from './panel_helpers.js';

describe( 'capitalize', () => {
  it( 'uppercases the first character only', () => {
    expect( capitalize( 'output' ) ).toBe( 'Output' );
    expect( capitalize( 'oUTPUT' ) ).toBe( 'OUTPUT' );
  } );

  it( 'returns empty strings unchanged', () => {
    expect( capitalize( '' ) ).toBe( '' );
  } );
} );

describe( 'formatContentTitle', () => {
  it( 'joins title segments with the shared separator', () => {
    expect( formatContentTitle( [ 'Workflow "demo"', 'Steps' ] ) ).toBe( 'Workflow "demo" › Steps' );
  } );
} );

describe( 'hasJsonValue', () => {
  it( 'rejects nullish and empty collection values', () => {
    expect( hasJsonValue( null ) ).toBe( false );
    expect( hasJsonValue( undefined ) ).toBe( false );
    expect( hasJsonValue( [] ) ).toBe( false );
    expect( hasJsonValue( {} ) ).toBe( false );
  } );

  it( 'accepts scalar and non-empty collection values', () => {
    expect( hasJsonValue( false ) ).toBe( true );
    expect( hasJsonValue( 0 ) ).toBe( true );
    expect( hasJsonValue( '' ) ).toBe( true );
    expect( hasJsonValue( [ 'x' ] ) ).toBe( true );
    expect( hasJsonValue( { x: 1 } ) ).toBe( true );
  } );
} );

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

describe( 'cycleValue', () => {
  it( 'cycles forward and backward through an ordered list', () => {
    expect( cycleValue( [ 'a', 'b', 'c' ], 'a', 1 ) ).toBe( 'b' );
    expect( cycleValue( [ 'a', 'b', 'c' ], 'a', -1 ) ).toBe( 'c' );
  } );
} );

describe( 'clampIndex', () => {
  it( 'clamps indexes to the available range', () => {
    expect( clampIndex( -1, 3 ) ).toBe( 0 );
    expect( clampIndex( 0, 3 ) ).toBe( 0 );
    expect( clampIndex( 5, 3 ) ).toBe( 2 );
  } );

  it( 'returns 0 for empty lists', () => {
    expect( clampIndex( 5, 0 ) ).toBe( 0 );
  } );
} );
