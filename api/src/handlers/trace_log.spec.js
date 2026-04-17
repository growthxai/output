import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const RID = '11111111-2222-4333-8444-555555555555';

const mockFetchTraceFromS3 = vi.fn();
vi.mock( '../clients/s3_client.js', () => ( {
  fetchTraceFromS3: ( ...args ) => mockFetchTraceFromS3( ...args )
} ) );

// errorHandler pulls in #logger -> #configs; stub both so this spec doesn't
// need production env vars set.
vi.mock( '#configs', () => ( { isProduction: false } ) );
vi.mock( '#logger', () => ( {
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), http: vi.fn() }
} ) );

import { createTraceLogHandler } from './trace_log.js';
import errorHandler from '../middleware/error_handler.js';

describe( 'trace_log handler', () => {
  const mockGetWorkflowResult = vi.fn();
  const mockClient = { getWorkflowResult: mockGetWorkflowResult };

  /**
   * Express app with both the latest-shortcut and the pinned route wired up,
   * mirroring the production mount in `index.js`.
   */
  const createApp = () => {
    const app = express();
    const handler = createTraceLogHandler( mockClient );
    app.get( '/workflow/:id/trace-log', handler );
    app.get( '/workflow/:id/runs/:rid/trace-log', handler );
    app.use( errorHandler );
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
      .expect( 404, {
        error: 'TraceNotAvailableError',
        message: 'No trace available for workflow "test-workflow-id".',
        workflowId: 'test-workflow-id'
      } );
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

  it( 'forwards the pinned rid to getWorkflowResult', async () => {
    mockGetWorkflowResult.mockResolvedValue( {
      workflowId: 'test-workflow-id',
      runId: RID,
      trace: { destinations: { local: '/tmp/t.json', remote: null } }
    } );

    await request( createApp() )
      .get( `/workflow/test-workflow-id/runs/${RID}/trace-log` )
      .expect( 200 );

    expect( mockGetWorkflowResult ).toHaveBeenCalledWith( 'test-workflow-id', RID );
  } );

  it( 'returns 400 when the pinned rid is not a valid UUID', async () => {
    await request( createApp() )
      .get( '/workflow/test-workflow-id/runs/not-a-uuid/trace-log' )
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

    const app = express();
    app.get( '/workflow/:id/trace-log', createTraceLogHandler( mockClient ) );
    app.use( ( err, _req, res, _next ) => res.status( 500 ).json( { error: err.message } ) );

    await request( app )
      .get( '/workflow/test-workflow-id/trace-log' )
      .expect( 500, { error: 'S3 access denied' } );
  } );

  it( 'calls error handler when getWorkflowResult throws', async () => {
    const error = new Error( 'Workflow not found' );
    mockGetWorkflowResult.mockRejectedValue( error );

    const app = express();
    app.get( '/workflow/:id/trace-log', createTraceLogHandler( mockClient ) );
    app.use( ( err, _req, res, _next ) => res.status( 500 ).json( { error: err.message } ) );

    await request( app )
      .get( '/workflow/test-workflow-id/trace-log' )
      .expect( 500, { error: 'Workflow not found' } );
  } );
} );
