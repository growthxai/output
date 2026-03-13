import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processUrl } from './steps.js';

vi.mock( './steps.js', () => ( {
  processUrl: vi.fn()
} ) );

vi.mock( '@outputai/core', async importOriginal => {
  const actual = await importOriginal<typeof import( '@outputai/core' )>();
  return {
    ...actual,
    sleep: vi.fn().mockResolvedValue( undefined )
  };
} );

import simpleSleep from './workflow.js';
import { sleep } from '@outputai/core';

describe( 'simple_sleep workflow', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'should process each URL with sleep between calls', async () => {
    vi.mocked( processUrl ).mockResolvedValue( { url: 'https://example.com', timestamp: 123 } );

    const input = {
      urls: [ 'https://example.com', 'https://test.com', 'https://demo.com' ],
      delayMs: 100
    };
    const result = await simpleSleep( input );

    expect( processUrl ).toHaveBeenCalledTimes( 3 );
    expect( processUrl ).toHaveBeenNthCalledWith( 1, 'https://example.com' );
    expect( processUrl ).toHaveBeenNthCalledWith( 2, 'https://test.com' );
    expect( processUrl ).toHaveBeenNthCalledWith( 3, 'https://demo.com' );

    expect( sleep ).toHaveBeenCalledTimes( 3 );
    expect( sleep ).toHaveBeenCalledWith( 100 );

    expect( result ).toEqual( { processed: 3 } );
  } );

  it( 'should use specified delay', async () => {
    vi.mocked( processUrl ).mockResolvedValue( { url: 'https://example.com', timestamp: 123 } );

    const input = { urls: [ 'https://example.com' ], delayMs: 200 };
    await simpleSleep( input );

    expect( sleep ).toHaveBeenCalledWith( 200 );
  } );

  it( 'should return zero processed for empty URL list', async () => {
    const input = { urls: [], delayMs: 100 };
    const result = await simpleSleep( input );

    expect( processUrl ).not.toHaveBeenCalled();
    expect( sleep ).not.toHaveBeenCalled();
    expect( result ).toEqual( { processed: 0 } );
  } );
} );
