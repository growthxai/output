import { describe, it, expect, vi, beforeEach } from 'vitest';

const toPayloadMock = vi.hoisted( () => vi.fn( value => ( { encoded: value } ) ) );
const fromPayloadMock = vi.hoisted( () => vi.fn( payload => payload.encoded ) );

vi.mock( '@temporalio/common', () => ( {
  defaultPayloadConverter: {
    toPayload: toPayloadMock,
    fromPayload: fromPayloadMock
  }
} ) );

describe( 'headers utils', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  describe( 'memoToHeaders', () => {
    it( 'converts memo entries into Temporal payload headers', async () => {
      const { memoToHeaders } = await import( './headers.js' );
      const memo = {
        traceInfo: { runId: 'run-1' },
        workflowDetails: { workflowId: 'workflow-1' }
      };

      const headers = memoToHeaders( memo );

      expect( headers ).toEqual( {
        traceInfo: { encoded: memo.traceInfo },
        workflowDetails: { encoded: memo.workflowDetails }
      } );
      expect( toPayloadMock ).toHaveBeenCalledTimes( 2 );
      expect( toPayloadMock ).toHaveBeenCalledWith( memo.traceInfo );
      expect( toPayloadMock ).toHaveBeenCalledWith( memo.workflowDetails );
    } );

    it( 'returns an empty object for nullish memo', async () => {
      const { memoToHeaders } = await import( './headers.js' );

      expect( memoToHeaders() ).toEqual( {} );
      expect( memoToHeaders( null ) ).toEqual( {} );
      expect( toPayloadMock ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'headersToObject', () => {
    it( 'converts Temporal payload headers into plain object values', async () => {
      const { headersToObject } = await import( './headers.js' );
      const headers = {
        traceInfo: { encoded: { runId: 'run-1' } },
        workflowDetails: { encoded: { workflowId: 'workflow-1' } }
      };

      const object = headersToObject( headers );

      expect( object ).toEqual( {
        traceInfo: headers.traceInfo.encoded,
        workflowDetails: headers.workflowDetails.encoded
      } );
      expect( fromPayloadMock ).toHaveBeenCalledTimes( 2 );
      expect( fromPayloadMock ).toHaveBeenCalledWith( headers.traceInfo );
      expect( fromPayloadMock ).toHaveBeenCalledWith( headers.workflowDetails );
    } );

    it( 'returns an empty object for nullish headers', async () => {
      const { headersToObject } = await import( './headers.js' );

      expect( headersToObject() ).toEqual( {} );
      expect( headersToObject( null ) ).toEqual( {} );
      expect( fromPayloadMock ).not.toHaveBeenCalled();
    } );
  } );
} );
