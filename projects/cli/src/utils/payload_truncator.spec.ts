import { describe, it, expect } from 'vitest';
import { truncateString, truncateStack, truncateValue } from './payload_truncator.js';

describe( 'truncateString', () => {
  it( 'keeps strings up to 1,024 characters whole', () => {
    const value = 'a'.repeat( 1024 );
    expect( truncateString( value ) ).toBe( value );
  } );

  it( 'keeps the first 1,000 and last 24 characters around a marker', () => {
    const value = `${'a'.repeat( 1000 )}${'m'.repeat( 5000 )}${'z'.repeat( 24 )}`;
    expect( truncateString( value ) ).toBe( `${'a'.repeat( 1000 )}... [5000 more characters omitted] ...${'z'.repeat( 24 )}` );
  } );

  it( 'does not split a grapheme cluster at either cut', () => {
    const family = '👨‍👩‍👧‍👦'; // 11 UTF-16 units, one cluster
    const value = `${'a'.repeat( 995 )}${family}${'m'.repeat( 3000 )}${family.repeat( 3 )}`;
    const omitted = value.length - 995 - ( family.length * 2 );
    expect( truncateString( value ) ).toBe( `${'a'.repeat( 995 )}... [${omitted} more characters omitted] ...${family.repeat( 2 )}` );
  } );
} );

describe( 'truncateStack', () => {
  it( 'keeps the first 10 lines', () => {
    const stack = Array.from( { length: 12 }, ( _, i ) => `line ${i}` ).join( '\n' );
    expect( truncateStack( stack ).split( '\n' ) ).toHaveLength( 11 );
    expect( truncateStack( stack ) ).toContain( '... [2 more lines omitted]' );
  } );
} );

describe( 'truncateValue', () => {
  it( 'caps arrays at 20 items with a marker', () => {
    const result = truncateValue( Array.from( { length: 25 }, ( _, i ) => i ) ) as unknown[];
    expect( result ).toHaveLength( 21 );
    expect( result[20] ).toBe( '... [5 more items omitted]' );
  } );

  it( 'caps objects at 50 keys with a marker', () => {
    const value = Object.fromEntries( Array.from( { length: 60 }, ( _, i ) => [ `k${i}`, i ] ) );
    const result = truncateValue( value ) as Record<string, unknown>;
    expect( Object.keys( result ) ).toHaveLength( 51 );
    expect( result['...'] ).toBe( '[Maximum Object Properties Reached]' );
  } );

  it( 'stops at depth 10', () => {
    const nest = ( n: number ): unknown => ( n === 0 ? 'leaf' : { next: nest( n - 1 ) } );
    expect( JSON.stringify( truncateValue( nest( 12 ) ) ) ).toContain( '[Maximum Depth Reached]' );
  } );

  it( 'stops after 1,000 visited values', () => {
    const wide = Object.fromEntries( Array.from( { length: 50 }, ( _, i ) => [ `k${i}`, i ] ) );
    const value = Array.from( { length: 20 }, () => wide );
    expect( JSON.stringify( truncateValue( value ) ) ).toContain( '[Serialization Limit Reached]' );
  } );

  it( 'passes short values through unchanged', () => {
    const value = { a: [ 1, 'two', null ], b: { c: true } };
    expect( truncateValue( value ) ).toEqual( value );
  } );
} );
