import { describe, expect, it } from 'vitest';
import { enforceActivityOptions } from './activity_options.js';

describe( 'enforceActivityOptions', () => {
  it( 'adds FatalError while preserving existing activity and retry options', () => {
    const activityOptions = {
      startToCloseTimeout: '5m',
      retry: {
        maximumAttempts: 4,
        nonRetryableErrorTypes: [ 'DomainError' ]
      }
    };

    expect( enforceActivityOptions( activityOptions ) ).toEqual( {
      startToCloseTimeout: '5m',
      retry: {
        maximumAttempts: 4,
        nonRetryableErrorTypes: [ 'DomainError', 'FatalError' ]
      }
    } );
  } );

  it( 'does not duplicate FatalError', () => {
    const result = enforceActivityOptions( {
      retry: { nonRetryableErrorTypes: [ 'FatalError', 'DomainError', 'FatalError' ] }
    } );

    expect( result.retry.nonRetryableErrorTypes ).toEqual( [ 'FatalError', 'DomainError' ] );
  } );

  it( 'returns a new object without mutating the provided options', () => {
    const activityOptions = {
      retry: {
        maximumAttempts: 2,
        nonRetryableErrorTypes: [ 'DomainError' ]
      }
    };
    const result = enforceActivityOptions( activityOptions );

    expect( result ).not.toBe( activityOptions );
    expect( result.retry ).not.toBe( activityOptions.retry );
    expect( activityOptions ).toEqual( {
      retry: {
        maximumAttempts: 2,
        nonRetryableErrorTypes: [ 'DomainError' ]
      }
    } );
  } );

  it( 'creates required retry options when options are omitted', () => {
    expect( enforceActivityOptions() ).toEqual( {
      retry: { nonRetryableErrorTypes: [ 'FatalError' ] }
    } );
  } );
} );
