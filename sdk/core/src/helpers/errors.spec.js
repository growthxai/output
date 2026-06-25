import { describe, expect, it } from 'vitest';
import { ApplicationFailure } from '@temporalio/common';
import { buildApplicationFailureWithDetails } from './errors.js';

class CustomFailure extends Error {}

describe( 'buildApplicationFailureWithDetails', () => {
  it( 'wraps a regular error in an ApplicationFailure with appended details', () => {
    const error = new Error( 'step failed' );
    const info = { aggregations: { cost: { total: 1 } } };

    const failure = buildApplicationFailureWithDetails( error, info );

    expect( failure ).toBeInstanceOf( ApplicationFailure );
    expect( failure ).toMatchObject( {
      message: 'step failed',
      type: 'Error',
      nonRetryable: false,
      details: [ info ],
      cause: error
    } );
  } );

  it( 'uses the original constructor name for custom errors', () => {
    const error = new CustomFailure( 'custom failed' );
    const info = { trace: { destinations: { local: '/tmp/trace' } } };

    const failure = buildApplicationFailureWithDetails( error, info );

    expect( failure ).toMatchObject( {
      message: 'custom failed',
      type: 'CustomFailure',
      details: [ info ],
      cause: error
    } );
  } );

  it( 'preserves existing details and appends new info without mutating the original error', () => {
    const existingDetails = [ { domain: { reason: 'bad-input' } } ];
    const error = new Error( 'step failed' );
    error.details = existingDetails;
    const info = { aggregations: { httpRequests: { total: 1 } } };

    const failure = buildApplicationFailureWithDetails( error, info );

    expect( failure.details ).toEqual( [
      { domain: { reason: 'bad-input' } },
      info
    ] );
    expect( error.details ).toBe( existingDetails );
    expect( error.details ).toEqual( [ { domain: { reason: 'bad-input' } } ] );
  } );

  it( 'ignores non-array details on the original error', () => {
    const error = new Error( 'step failed' );
    error.details = { domain: { reason: 'bad-input' } };
    const info = { aggregations: { tokens: { total: 3 } } };

    const failure = buildApplicationFailureWithDetails( error, info );

    expect( failure.details ).toEqual( [ info ] );
  } );

  it( 'preserves ApplicationFailure type, nonRetryable flag, and details while avoiding self-cause', () => {
    const original = ApplicationFailure.create( {
      message: 'application failed',
      type: 'DomainFailure',
      nonRetryable: true,
      details: [ { domain: { reason: 'bad-input' } } ]
    } );
    const info = { aggregations: { cost: { total: 2 } } };

    const failure = buildApplicationFailureWithDetails( original, info );

    expect( failure ).toBeInstanceOf( ApplicationFailure );
    expect( failure ).not.toBe( original );
    expect( failure.cause ).toBe( original );
    expect( failure.cause ).not.toBe( failure );
    expect( failure ).toMatchObject( {
      message: 'application failed',
      type: 'DomainFailure',
      nonRetryable: true,
      details: [
        { domain: { reason: 'bad-input' } },
        info
      ]
    } );
  } );
} );
