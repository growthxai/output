import { describe, it, expect } from 'vitest';
import { isNonNegativeNumber, isNonNegativeInteger, safeSum } from './number.js';

describe( 'isNonNegativeNumber', () => {
  it.each( [ 0, -0, 1, 0.5, 1e21, Number.MAX_VALUE, Number.MAX_SAFE_INTEGER + 2 ] )( 'accepts %s', v => {
    expect( isNonNegativeNumber( v ) ).toBe( true );
  } );

  it.each( [ -1, -0.5, -Infinity, Infinity, NaN ] )( 'rejects %s', v => {
    expect( isNonNegativeNumber( v ) ).toBe( false );
  } );

  it.each( [ '1', null, undefined, {}, [], true, 1n ] )( 'rejects the non-number %s', v => {
    expect( isNonNegativeNumber( v ) ).toBe( false );
  } );
} );

describe( 'isNonNegativeInteger', () => {
  it.each( [ 0, -0, 1, 42, Number.MAX_SAFE_INTEGER ] )( 'accepts %s', v => {
    expect( isNonNegativeInteger( v ) ).toBe( true );
  } );

  it.each( [ 0.5, 1.0000001, Number.MAX_SAFE_INTEGER + 1, 1e21 ] )( 'rejects the fraction or unsafe integer %s', v => {
    expect( isNonNegativeInteger( v ) ).toBe( false );
  } );

  it.each( [ -1, -Infinity, Infinity, NaN ] )( 'rejects %s', v => {
    expect( isNonNegativeInteger( v ) ).toBe( false );
  } );

  it.each( [ '1', null, undefined, {}, [], true, 1n ] )( 'rejects the non-number %s', v => {
    expect( isNonNegativeInteger( v ) ).toBe( false );
  } );
} );

describe( 'safeSum', () => {
  it( 'sums non-negative safe integers', () => {
    expect( safeSum( 1, 2, 3 ) ).toBe( 6 );
  } );

  it( 'returns 0 without values', () => {
    expect( safeSum() ).toBe( 0 );
  } );

  it( 'ignores negatives, fractions, unsafe integers, non-finite values and non-numbers', () => {
    expect( safeSum( 1, -2, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '3', null, undefined, 4 ) ).toBe( 5 );
  } );

  it( 'counts zero as a value that adds nothing', () => {
    expect( safeSum( 0, 7 ) ).toBe( 7 );
  } );
} );
