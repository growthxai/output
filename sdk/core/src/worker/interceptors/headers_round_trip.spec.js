import { describe, it, expect } from 'vitest';
import { createWorkflowDetails } from '#helpers/temporal_context';
import { headersToObject, memoToHeaders } from './headers.js';

describe( 'headers round trip with the real payload converter', () => {
  it( 'preserves workflowDetails.searchAttributes, with Datetime values as ISO strings', () => {
    const workflowDetails = createWorkflowDetails( {
      attempt: 1,
      firstExecutionRunId: 'run-1',
      runId: 'run-1',
      runStartTime: new Date( '2026-06-02T09:00:00.000Z' ),
      startTime: new Date( '2026-06-02T09:00:00.000Z' ),
      workflowId: 'wf-1',
      workflowType: 'prompt',
      searchAttributes: {
        CustomerId: [ 'cust-1' ],
        Tags: [ 'a', 'b' ],
        Priority: [ 3 ],
        IsTest: [ false ],
        ScheduledAt: [ new Date( '2026-06-02T08:00:00.000Z' ) ]
      }
    } );

    const { workflowDetails: decoded } = headersToObject( memoToHeaders( { workflowDetails } ) );

    expect( decoded.searchAttributes ).toEqual( {
      CustomerId: [ 'cust-1' ],
      Tags: [ 'a', 'b' ],
      Priority: [ 3 ],
      IsTest: [ false ],
      ScheduledAt: [ '2026-06-02T08:00:00.000Z' ]
    } );
    expect( decoded.searchAttributes ).toEqual( workflowDetails.searchAttributes );
  } );
} );
