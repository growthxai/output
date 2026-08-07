import { describe, it, expect } from 'vitest';
import { isUrl, toUrlSafeBase64, rxEscape } from './string.js';

describe( 'toUrlSafeBase64', () => {
  const urlSafeAlphabet = /^[A-Za-z0-9_-]+$/;

  it( 'returns a string for a valid UUID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect( typeof toUrlSafeBase64( uuid ) ).toBe( 'string' );
    expect( toUrlSafeBase64( uuid ).length ).toBeGreaterThan( 0 );
  } );

  it( 'output length is 21 or 22 for a standard UUID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const out = toUrlSafeBase64( uuid );
    expect( out.length ).toBeGreaterThanOrEqual( 21 );
    expect( out.length ).toBeLessThanOrEqual( 22 );
  } );

  it( 'output contains only url-safe alphabet characters', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const out = toUrlSafeBase64( uuid );
    expect( out ).toMatch( urlSafeAlphabet );
  } );

  it( 'is deterministic for the same UUID', () => {
    const uuid = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    expect( toUrlSafeBase64( uuid ) ).toBe( toUrlSafeBase64( uuid ) );
  } );

  it( 'different UUIDs produce different strings', () => {
    const a = toUrlSafeBase64( '550e8400-e29b-41d4-a716-446655440000' );
    const b = toUrlSafeBase64( '6ba7b810-9dad-11d1-80b4-00c04fd430c8' );
    expect( a ).not.toBe( b );
  } );

  it( 'strips hyphens and encodes hex (same as 32-char hex)', () => {
    const withHyphens = '550e8400-e29b-41d4-a716-446655440000';
    const hexOnly = '550e8400e29b41d4a716446655440000';
    expect( toUrlSafeBase64( withHyphens ) ).toBe( toUrlSafeBase64( hexOnly ) );
  } );
} );

describe( 'rxEscape', () => {
  it( 'escapes all regexp metacharacters', () => {
    expect( rxEscape( '.*+?^${}()|[]\\' ) ).toBe( '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\' );
  } );

  it( 'keeps file URL paths matchable as literal regexp input', () => {
    const path = 'file://foo/bar';
    const rx = new RegExp( `^${rxEscape( path )}$` );

    expect( rx.test( path ) ).toBe( true );
    expect( rx.test( 'file://foo/bar/baz' ) ).toBe( false );
  } );

  it( 'keeps Windows paths matchable as literal regexp input', () => {
    const path = String.raw`C:\foo\bar`;
    const rx = new RegExp( `^${rxEscape( path )}$` );

    expect( rx.test( path ) ).toBe( true );
    expect( rx.test( String.raw`C:\foo\bar\baz` ) ).toBe( false );
  } );
} );

describe( 'isUrl', () => {
  it.each( [
    'https://example.com/path?token=secret#section',
    'ftp://user:password@example.com/file.txt',
    'ftps://example.com/file.txt',
    'git+ssh://example.com/repository',
    'custom.protocol-v2://example.com/resource'
  ] )( 'accepts a valid URL starting with a protocol: %s', value => {
    expect( isUrl( value ) ).toBe( true );
  } );

  it.each( [
    'Error: fetch failed',
    'TypeError: invalid input',
    'mailto:user@example.com',
    'urn:isbn:978014',
    'data:text/plain,hello'
  ] )( 'rejects non-authority URI-like strings: %s', value => {
    expect( isUrl( value ) ).toBe( false );
  } );

  it.each( [
    '//example.com/path',
    '/relative/path',
    'https://',
    'not a URL'
  ] )( 'rejects malformed or relative values: %s', value => {
    expect( isUrl( value ) ).toBe( false );
  } );

  it.each( [ undefined, null, 42, new URL( 'https://example.com' ) ] )( 'rejects non-string values', value => {
    expect( isUrl( value ) ).toBe( false );
  } );
} );
