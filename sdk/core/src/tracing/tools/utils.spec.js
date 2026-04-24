import { describe, it, expect, vi } from 'vitest';
import { safeFormatJSON, serializeError } from './utils.js';

const isPrettyStringifyCall = args => args.length >= 3 && args[2] === 2;

/** @param {number} targetBytes UTF-8 size of compact JSON.stringify( { a: "<xs>" } ) */
const objectWithCompactByteLength = targetBytes => {
  const sample = { a: '' };
  const overhead = Buffer.byteLength( JSON.stringify( sample ), 'utf8' );
  const repeat = Math.max( 0, targetBytes - overhead );
  return { a: 'x'.repeat( repeat ) };
};

describe( 'tracing/utils', () => {
  it( 'serializeError unwraps causes and keeps message/stack', () => {
    const inner = new Error( 'inner' );
    const outer = new Error( 'outer', { cause: inner } );

    const out = serializeError( outer );
    expect( out.name ).toBe( 'Error' );
    expect( out.message ).toBe( 'inner' );
    expect( typeof out.stack ).toBe( 'string' );
  } );

  describe( 'safeFormatJSON', () => {
    it( 'formats small objects with indentation when under threshold', () => {
      const content = { a: 1, b: [ 2, 3 ] };
      const out = safeFormatJSON( content, 10_000 );

      expect( out ).toContain( '\n' );
      expect( out ).toMatch( /^\{\n/ );
      expect( JSON.parse( out ) ).toEqual( content );
    } );

    it( 'formats small arrays with indentation when under threshold', () => {
      const content = [ 1, { nested: true } ];
      const out = safeFormatJSON( content, 10_000 );

      expect( out ).toContain( '\n' );
      expect( out.trimStart() ).toMatch( /^\[/ );
      expect( JSON.parse( out ) ).toEqual( content );
    } );

    it( 'returns compact JSON when compact UTF-8 size is strictly greater than threshold', () => {
      const content = objectWithCompactByteLength( 40 );
      const compact = JSON.stringify( content );
      expect( Buffer.byteLength( compact, 'utf8' ) ).toBe( 40 );

      const out = safeFormatJSON( content, 39 );
      expect( out ).toBe( compact );
      expect( out ).not.toContain( '\n  ' );
      expect( JSON.parse( out ) ).toEqual( content );
    } );

    it( 'uses pretty JSON when compact UTF-8 size equals threshold', () => {
      const content = objectWithCompactByteLength( 40 );
      const compact = JSON.stringify( content );
      expect( Buffer.byteLength( compact, 'utf8' ) ).toBe( 40 );

      const out = safeFormatJSON( content, 40 );
      expect( out ).not.toBe( compact );
      expect( out ).toContain( '\n' );
      expect( JSON.parse( out ) ).toEqual( content );
    } );

    it( 'uses UTF-8 byte length for threshold, not JavaScript string length', () => {
      const content = { label: 'éclair' };
      const compact = JSON.stringify( content );
      expect( compact.length ).toBeLessThan( Buffer.byteLength( compact, 'utf8' ) );

      const bytes = Buffer.byteLength( compact, 'utf8' );
      const outCompact = safeFormatJSON( content, bytes - 1 );
      expect( outCompact ).toBe( compact );

      const outPretty = safeFormatJSON( content, bytes + 100 );
      expect( outPretty ).toContain( '\n' );
      expect( JSON.parse( outPretty ) ).toEqual( content );
    } );

    it( 'round-trips empty object and primitives for both branches', () => {
      const tiny = {};
      const pretty = safeFormatJSON( tiny, 100 );
      expect( JSON.parse( pretty ) ).toEqual( tiny );

      const forcedCompact = safeFormatJSON( tiny, 0 );
      expect( JSON.parse( forcedCompact ) ).toEqual( tiny );
    } );

    it( 'returns compact JSON when pretty stringify throws Invalid string length', () => {
      const content = { a: 1 };
      const compact = JSON.stringify( content );
      const origStringify = JSON.stringify.bind( JSON );

      const spy = vi.spyOn( JSON, 'stringify' ).mockImplementation( ( ...args ) => {
        if ( isPrettyStringifyCall( args ) ) {
          throw new RangeError( 'Invalid string length' );
        }
        return origStringify( ...args );
      } );

      try {
        const out = safeFormatJSON( content, 10_000 );
        expect( out ).toBe( compact );
        expect( JSON.parse( out ) ).toEqual( content );
      } finally {
        spy.mockRestore();
      }
    } );

    it( 'rethrows RangeError when message is not Invalid string length', () => {
      const content = { a: 1 };
      const origStringify = JSON.stringify.bind( JSON );

      const spy = vi.spyOn( JSON, 'stringify' ).mockImplementation( ( ...args ) => {
        if ( isPrettyStringifyCall( args ) ) {
          throw new RangeError( 'not the string length error' );
        }
        return origStringify( ...args );
      } );

      try {
        expect( () => safeFormatJSON( content, 10_000 ) ).toThrow( RangeError );
      } finally {
        spy.mockRestore();
      }
    } );

    it( 'rethrows non-RangeError from pretty stringify', () => {
      const content = { a: 1 };
      const origStringify = JSON.stringify.bind( JSON );

      const spy = vi.spyOn( JSON, 'stringify' ).mockImplementation( ( ...args ) => {
        if ( isPrettyStringifyCall( args ) ) {
          throw new TypeError( 'cyclic structure' );
        }
        return origStringify( ...args );
      } );

      try {
        expect( () => safeFormatJSON( content, 10_000 ) ).toThrow( TypeError );
      } finally {
        spy.mockRestore();
      }
    } );
  } );
} );
