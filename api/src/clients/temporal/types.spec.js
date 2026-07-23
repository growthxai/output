import { describe, it, expect } from 'vitest';
import { GrpcStatus, WorkflowStatus, formatStatus, isWorkflowClosed } from './types.js';

describe( 'WorkflowStatus', () => {
  it( 'exposes Temporal workflow execution status code values', () => {
    expect( WorkflowStatus ).toEqual( {
      RUNNING: 1,
      COMPLETED: 2,
      FAILED: 3,
      CANCELED: 4,
      TERMINATED: 5,
      CONTINUED_AS_NEW: 6,
      TIMED_OUT: 7
    } );
  } );
} );

describe( 'isWorkflowClosed', () => {
  it.each( [
    WorkflowStatus.COMPLETED,
    WorkflowStatus.FAILED,
    WorkflowStatus.CANCELED,
    WorkflowStatus.TERMINATED,
    WorkflowStatus.CONTINUED_AS_NEW,
    WorkflowStatus.TIMED_OUT
  ] )( 'returns true for terminal status code %s', status => {
    expect( isWorkflowClosed( status ) ).toBe( true );
  } );

  it( 'returns false for running and unknown status codes', () => {
    expect( isWorkflowClosed( WorkflowStatus.RUNNING ) ).toBe( false );
    expect( isWorkflowClosed( 0 ) ).toBe( false );
    expect( isWorkflowClosed( undefined ) ).toBe( false );
  } );
} );

describe( 'GrpcStatus', () => {
  it( 'exposes the gRPC codes used by Temporal client helpers', () => {
    expect( GrpcStatus ).toEqual( {
      INVALID_ARGUMENT: 3,
      NOT_FOUND: 5
    } );
  } );
} );

describe( 'formatStatus', () => {
  it( 'formats Temporal status names for API responses', () => {
    expect( formatStatus( 'COMPLETED' ) ).toBe( 'completed' );
    expect( formatStatus( 'CANCELLED' ) ).toBe( 'cancelled' );
    expect( formatStatus( 'CONTINUED_AS_NEW' ) ).toBe( 'continued_as_new' );
  } );

  it( 'falls back to unspecified when Temporal omits the name', () => {
    expect( formatStatus() ).toBe( 'unspecified' );
    expect( formatStatus( null ) ).toBe( 'unspecified' );
  } );
} );
