import { describe, expect, it } from 'vitest';
import { extractErrorDetail } from './errors.js';

describe( 'extractErrorDetail', () => {
  it( 'returns a matching value from error details', () => {
    const error = new Error( 'failed' );
    error.details = [
      { requestId: 'req-1' },
      { workflowId: 'workflow-1' }
    ];

    expect( extractErrorDetail( error, 'workflowId' ) ).toBe( 'workflow-1' );
  } );

  it( 'walks the cause chain until it finds matching details', () => {
    const root = new Error( 'root' );
    root.details = [ { traceId: 'trace-1' } ];
    const wrapped = new Error( 'wrapped', { cause: root } );

    expect( extractErrorDetail( wrapped, 'traceId' ) ).toBe( 'trace-1' );
  } );

  it( 'prefers details from the current error over causes', () => {
    const root = new Error( 'root' );
    root.details = [ { traceId: 'root-trace' } ];
    const wrapped = new Error( 'wrapped', { cause: root } );
    wrapped.details = [ { traceId: 'wrapped-trace' } ];

    expect( extractErrorDetail( wrapped, 'traceId' ) ).toBe( 'wrapped-trace' );
  } );

  it( 'returns null when the key is not found', () => {
    const root = new Error( 'root' );
    root.details = [ { traceId: 'trace-1' } ];
    const wrapped = new Error( 'wrapped', { cause: root } );

    expect( extractErrorDetail( wrapped, 'missing' ) ).toBeNull();
  } );

  it( 'returns null for empty errors', () => {
    expect( extractErrorDetail( null, 'traceId' ) ).toBeNull();
  } );
} );
