import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getRetryDelayFromResponse } from './header_utils.js';

/** Builds a response-like object with optional Retry-After header. */
const buildResponse = ( retryAfter: string | null ): { headers?: Headers } =>
  retryAfter !== null ?
    { headers: new Headers( { 'Retry-After': retryAfter } ) } :
    { headers: new Headers() };

describe( 'getRetryDelayFromResponse', () => {
  beforeEach( () => {
    vi.useFakeTimers();
    vi.setSystemTime( new Date( '2025-02-25T12:00:00.000Z' ) );
  } );

  afterEach( () => {
    vi.useRealTimers();
  } );

  describe( 'delay-seconds (integer)', () => {
    it( 'returns ms for positive integer seconds', () => {
      expect( getRetryDelayFromResponse( buildResponse( '0' ) ) ).toBe( 0 );
      expect( getRetryDelayFromResponse( buildResponse( '1' ) ) ).toBe( 1000 );
      expect( getRetryDelayFromResponse( buildResponse( '120' ) ) ).toBe( 120_000 );
    } );

    it( 'returns null for negative integer', () => {
      expect( getRetryDelayFromResponse( buildResponse( '-1' ) ) ).toBeNull();
    } );

    it( 'returns null for non-integer number', () => {
      expect( getRetryDelayFromResponse( buildResponse( '12.34' ) ) ).toBeNull();
    } );
  } );

  describe( 'HTTP-date', () => {
    it( 'returns 0 when date is in the past', () => {
      expect( getRetryDelayFromResponse( buildResponse( 'Wed, 21 Oct 2015 07:28:00 GMT' ) ) ).toBe( 0 );
    } );

    it( 'returns ms until future date', () => {
      const future = 'Tue, 25 Feb 2025 12:00:02 GMT';
      expect( getRetryDelayFromResponse( buildResponse( future ) ) ).toBe( 2000 );
    } );
  } );

  describe( 'invalid or missing header', () => {
    it( 'returns null for empty string', () => {
      expect( getRetryDelayFromResponse( buildResponse( '' ) ) ).toBeNull();
    } );

    it( 'returns null for non-numeric non-date string', () => {
      expect( getRetryDelayFromResponse( buildResponse( 'invalid' ) ) ).toBeNull();
      expect( getRetryDelayFromResponse( buildResponse( 'abc123' ) ) ).toBeNull();
    } );

    it( 'returns null when Retry-After header is absent', () => {
      expect( getRetryDelayFromResponse( buildResponse( null ) ) ).toBeNull();
    } );

    it( 'returns null when response has no headers property', () => {
      expect( getRetryDelayFromResponse( {} ) ).toBeNull();
    } );
  } );
} );
