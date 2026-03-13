import { describe, it, expect, vi } from 'vitest';
import createTraceId from './create_trace_id.js';

describe( 'utils/create_trace_id', () => {
  it( 'returns the X-Request-ID header when present', () => {
    const req = new Request( 'https://ex.com/users/1', {
      method: 'GET',
      headers: { 'X-Request-ID': 'test-uuid-123' }
    } );
    const id = createTraceId( req );
    expect( id ).toBe( 'test-uuid-123' );
  } );

  it( 'returns null and logs warning when X-Request-ID header is missing', () => {
    const warnSpy = vi.spyOn( console, 'warn' ).mockImplementation( () => {} );
    const req = new Request( 'https://ex.com/users/1', { method: 'GET' } );
    const id = createTraceId( req );

    expect( id ).toBeNull();
    expect( warnSpy ).toHaveBeenCalledWith(
      'createTraceId: X-Request-ID header not found. Tracing will be skipped for this request.'
    );

    warnSpy.mockRestore();
  } );
} );
