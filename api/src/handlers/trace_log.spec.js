import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockFetchTraceFromS3 = vi.fn();
vi.mock( '../clients/s3_client.js', () => ( {
  fetchTraceFromS3: ( ...args ) => mockFetchTraceFromS3( ...args )
} ) );

import { createTraceLogHandler } from './trace_log.js';
import errorHandler from '../middleware/error_handler.js';

describe( 'trace_log handler', () => {
  const mockGetWorkflowResult = vi.fn();
  const mockClient = { getWorkflowResult: mockGetWorkflowResult };

  /** Express app with trace-log route and injected mock client. */
  const createApp = () => {
    const app = express();
    app.get( '/workflow/:id/trace-log', createTraceLogHandler( mockClient ) );
    return app;
  };

  beforeEach( () => {
    vi.clearAllMocks();
    mockFetchTraceFromS3.mockReset();
  } );

  it( 'returns 404 when workflow has no trace destinations', async () => {
    mockGetWorkflowResult.mockResolvedValue( {
      workflowId: 'test-workflow-id',
      trace: { destinations: { local: null, remote: null } }
    } );

    await request( createApp() )
      .get( '/workflow/test-workflow-id/trace-log' )
      .expect( 404, { error: 'No trace available for this workflow' } );
  } );

  it( 'returns remote response with data for S3 traces', async () => {
    const mockTraceData = { workflow: 'test', steps: [ { name: 'step1' } ] };
    mockGetWorkflowResult.mockResolvedValue( {
      workflowId: 'test-workflow-id',
      runId: 'r-remote',
      trace: {
        destinations: {
          local: null,
          remote: 'https://my-bucket.s3.amazonaws.com/traces/file.json'
        }
      }
    } );
    mockFetchTraceFromS3.mockResolvedValue( mockTraceData );

    const res = await request( createApp() )
      .get( '/workflow/test-workflow-id/trace-log' )
      .expect( 200 );

    expect( res.body ).toEqual( { source: 'remote', runId: 'r-remote', data: mockTraceData } );
    expect( mockFetchTraceFromS3 ).toHaveBeenCalledWith( 'https://my-bucket.s3.amazonaws.com/traces/file.json' );
    expect( mockGetWorkflowResult ).toHaveBeenCalledWith( 'test-workflow-id', undefined );
  } );

  it( 'returns local response for local-only traces', async () => {
    mockGetWorkflowResult.mockResolvedValue( {
      workflowId: 'test-workflow-id',
      runId: 'r-local',
      trace: {
        destinations: {
          local: '/path/to/local/trace.json',
          remote: null
        }
      }
    } );

    await request( createApp() )
      .get( '/workflow/test-workflow-id/trace-log' )
      .expect( 200, { source: 'local', runId: 'r-local', localPath: '/path/to/local/trace.json' } );
  } );

  it( 'forwards runId query param to getWorkflowResult', async () => {
    mockGetWorkflowResult.mockResolvedValue( {
      workflowId: 'test-workflow-id',
      runId: 'explicit-run',
      trace: { destinations: { local: '/tmp/t.json', remote: null } }
    } );

    await request( createApp() )
      .get( '/workflow/test-workflow-id/trace-log?runId=explicit-run' )
      .expect( 200 );

    expect( mockGetWorkflowResult ).toHaveBeenCalledWith( 'test-workflow-id', 'explicit-run' );
  } );

  it( 'returns 400 when runId query param is not a string', async () => {
    const app = createApp();
    app.use( errorHandler );

    await request( app )
      .get( '/workflow/test-workflow-id/trace-log?runId=a&runId=b' )
      .expect( 400 );

    expect( mockGetWorkflowResult ).not.toHaveBeenCalled();
  } );

  it( 'calls error handler when S3 fetch fails', async () => {
    mockGetWorkflowResult.mockResolvedValue( {
      workflowId: 'test-workflow-id',
      trace: {
        destinations: {
          local: null,
          remote: 'https://my-bucket.s3.amazonaws.com/traces/file.json'
        }
      }
    } );
    const s3Error = new Error( 'S3 access denied' );
    mockFetchTraceFromS3.mockRejectedValue( s3Error );

    const app = createApp();
    app.use( ( err, _req, res, _next ) => res.status( 500 ).json( { error: err.message } ) );

    await request( app )
      .get( '/workflow/test-workflow-id/trace-log' )
      .expect( 500, { error: 'S3 access denied' } );
  } );

  it( 'calls error handler when getWorkflowResult throws', async () => {
    const error = new Error( 'Workflow not found' );
    mockGetWorkflowResult.mockRejectedValue( error );

    const app = createApp();
    app.use( ( err, _req, res, _next ) => res.status( 500 ).json( { error: err.message } ) );

    await request( app )
      .get( '/workflow/test-workflow-id/trace-log' )
      .expect( 500, { error: 'Workflow not found' } );
  } );
} );
