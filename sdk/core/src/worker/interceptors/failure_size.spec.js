import { describe, it, expect, vi } from 'vitest';
import { ApplicationFailure, defaultFailureConverter, defaultPayloadConverter } from '@temporalio/common';
import pkg from '@temporalio/proto';
import { capFailureSize, FAILURE_SIZE_LIMIT_BYTES } from './failure_size.js';

vi.mock( '#logger', () => ( { createChildLogger: () => ( { warn: vi.fn() } ) } ) );

const { temporal } = pkg;
const encodedSize = failure =>
  temporal.api.failure.v1.Failure.encode( defaultFailureConverter.errorToFailure( failure, defaultPayloadConverter ) ).finish().byteLength;

// Mirrors the activity interceptor: the message lands in the failure, its stack, the cause and the cause's stack.
const wrap = ( error, nonRetryable = false ) =>
  ApplicationFailure.fromError( error, { nonRetryable, cause: error, details: [ { error: { message: error.message } } ] } );

describe( 'capFailureSize', () => {
  it( 'returns a failure within the limit unchanged', () => {
    const failure = wrap( new Error( 'boom' ) );

    expect( capFailureSize( failure ) ).toBe( failure );
  } );

  it( 'replaces an oversized retryable failure with a compact non-retryable one', () => {
    const error = new TypeError( 'x'.repeat( 700_000 ) );
    const failure = wrap( error );
    expect( encodedSize( failure ) ).toBeGreaterThan( FAILURE_SIZE_LIMIT_BYTES );

    const capped = capFailureSize( failure );

    expect( capped ).toBeInstanceOf( ApplicationFailure );
    expect( capped.nonRetryable ).toBe( true );
    expect( capped.type ).toBe( 'TypeError' );
    expect( capped.cause ).toBeUndefined();
    expect( capped.details ).toBeUndefined();
    expect( capped.message ).toMatch( /^x{16384}\.\.\. \[683616 more characters omitted\]/ );
    expect( capped.message ).toMatch( /over Temporal's 2097152-byte limit; not retried\]$/ );
    expect( encodedSize( capped ) ).toBeLessThan( 64 * 1024 );
  } );

  it( 'caps oversized details', () => {
    const failure = ApplicationFailure.retryable( 'too much detail', 'DomainFailure', { blob: 'y'.repeat( 3_000_000 ) } );

    const capped = capFailureSize( failure );

    expect( capped.nonRetryable ).toBe( true );
    expect( capped.type ).toBe( 'DomainFailure' );
    expect( capped.message ).toMatch( /^too much detail \[failure was \d+ bytes/ );
  } );

  it( 'returns a failure it cannot encode unchanged', () => {
    const failure = ApplicationFailure.retryable( 'bad details', 'DomainFailure', { n: 1n } );

    expect( capFailureSize( failure ) ).toBe( failure );
  } );
} );
