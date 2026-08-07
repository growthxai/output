import { describe, it, expect } from 'vitest';
import { redactHeaders, redactUrl } from './redact.js';

describe( 'redactUrl', () => {
  it( 'redacts credentials, query values, and the fragment while preserving URL structure', () => {
    const result = redactUrl( 'https://user:password@example.com/models?model=gpt-5&token=secret#debug' );

    expect( result ).toBe( 'https://***:***@example.com/models?model=***&token=***#***' );
  } );

  it( 'preserves duplicate query parameters and their order', () => {
    const result = redactUrl( 'https://example.com/search?tag=first&tag=second&empty=#results' );

    expect( result ).toBe( 'https://example.com/search?tag=***&tag=***&empty=***#***' );
  } );

  it( 'returns URLs without redacted components unchanged', () => {
    expect( redactUrl( 'https://example.com/path' ) ).toBe( 'https://example.com/path' );
  } );

  it( 'does not mutate URL instances', () => {
    const originalValue = 'ftp://user:password@example.com/file.txt?download=true#details';
    const url = new URL( originalValue );

    expect( redactUrl( url ) ).toBe( 'ftp://***:***@example.com/file.txt?download=***#***' );
    expect( url.toString() ).toBe( originalValue );
  } );
} );

describe( 'redactHeaders', () => {
  it( 'redacts sensitive header names', () => {
    const result = redactHeaders( {
      Authorization: 'Bearer token',
      'X-Api-Key': 'api-key',
      Cookie: 'session=id',
      'x-client-secret': 'secret'
    } );

    expect( result ).toEqual( {
      Authorization: '[REDACTED]',
      'X-Api-Key': '[REDACTED]',
      Cookie: '[REDACTED]',
      'x-client-secret': '[REDACTED]'
    } );
  } );

  it( 'preserves non-sensitive header names and ignored false positives', () => {
    const result = redactHeaders( {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-csrf-token': 'csrf-token',
      'public-key-pins': 'pin'
    } );

    expect( result ).toEqual( {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-csrf-token': 'csrf-token',
      'public-key-pins': 'pin'
    } );
  } );

  it( 'handles empty headers', () => {
    expect( redactHeaders( {} ) ).toEqual( {} );
  } );
} );
