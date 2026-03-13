import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processUrl } from './steps.js';

describe( 'processUrl step', () => {
  const consoleSpy = vi.spyOn( console, 'log' ).mockImplementation( () => {} );

  beforeEach( () => {
    vi.clearAllMocks();
  } );

  afterEach( () => {
    consoleSpy.mockClear();
  } );

  it( 'should process URL and return result with timestamp', async () => {
    const url = 'https://example.com';
    const result = await processUrl( url );

    expect( result.url ).toBe( url );
    expect( typeof result.timestamp ).toBe( 'number' );
    expect( consoleSpy ).toHaveBeenCalledWith( `Processing URL: ${url}` );
  } );
} );
