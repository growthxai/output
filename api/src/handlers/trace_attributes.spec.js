import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const RID = '11111111-2222-4333-8444-555555555555';
const REMOTE_URL = 'https://my-bucket.s3.amazonaws.com/traces/simple/2026-05-13/test-workflow-id.json';

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

import { createTraceAttributesHandler } from './trace_attributes.js';
import errorHandler from '../middleware/error_handler.js';
import { WorkflowNotCompletedError } from '../clients/errors.js';

describe( 'trace_attributes handler', () => {
  const mockGetWorkflowResult = vi.fn();
  const mockClient = { getWorkflowResult: mockGetWorkflowResult };

  const createApp = () => {
    const app = express();
    const handler = createTraceAttributesHandler( mockClient );
    app.get( '/workflow/:id/trace-attributes', handler );
    app.get( '/workflow/:id/runs/:rid/trace-attributes', handler );
    app.use( errorHandler );
    return app;
  };

  beforeEach( () => {
    vi.clearAllMocks();
    mockFetchTraceFromS3.mockReset();
  } );

  // Realistic trace tree shape: a workflow node with two LLM children (one new
  // attribute shape, one legacy output.usage shape) and an HTTP child. Same
  // structure /trace-log already returns from S3.
  const fixtureTrace = () => ( {
    id: 'wf',
    kind: 'workflow',
    name: 'simple',
    startedAt: 1715567000000,
    endedAt: 1715567027341,
    attributes: {},
    children: [
      {
        id: 'llm-1',
        kind: 'llm',
        name: 'llm-call',
        startedAt: 1715567001000,
        endedAt: 1715567005000,
        attributes: {
          cost: { total: 0.3, components: [ { name: 'input_tokens', value: 0.1 }, { name: 'output_tokens', value: 0.2 } ] },
          token_usage: { inputTokens: 1000, outputTokens: 200, cachedInputTokens: 50, totalTokens: 1200 }
        },
        output: { result: '...' },
        children: []
      },
      {
        id: 'llm-2-legacy',
        kind: 'llm',
        name: 'llm-call-legacy',
        startedAt: 1715567006000,
        endedAt: 1715567010000,
        // No attributes.token_usage on this node — must fall back to output.usage.
        attributes: { cost: { total: 0.0829 } },
        output: { result: '...', usage: { inputTokens: 500, outputTokens: 100, totalTokens: 600 } },
        children: []
      },
      {
        id: 'http-1',
        kind: 'http',
        name: 'gx-scraper',
        startedAt: 1715567011000,
        endedAt: 1715567012000,
        attributes: { cost: { total: 0.04 } },
        children: []
      }
    ]
  } );

  it( 'returns 200 with the full aggregated payload for a completed workflow', async () => {
    mockGetWorkflowResult.mockResolvedValue( {
      workflowId: 'test-workflow-id',
      runId: 'r-remote',
      trace: { destinations: { local: null, remote: REMOTE_URL } }
    } );
    mockFetchTraceFromS3.mockResolvedValue( fixtureTrace() );

    const res = await request( createApp() )
      .get( '/workflow/test-workflow-id/trace-attributes' )
      .expect( 200 );

    expect( res.body ).toMatchObject( {
      workflowId: 'test-workflow-id',
      runId: 'r-remote',
      startTime: 1715567000000,
      finishTime: 1715567027341,
      runtime: 27341,
      traceUrl: REMOTE_URL
    } );

    // tokenUsage sums attributes.token_usage + legacy output.usage on llm nodes
    expect( res.body.attributes.tokenUsage ).toEqual( {
      inputTokens: 1500,
      outputTokens: 300,
      cachedInputTokens: 50,
      totalTokens: 1800
    } );

    // cost.components is grouped by event-name bucket, total = sum of components
    const byName = Object.fromEntries(
      res.body.attributes.cost.components.map( c => [ c.name, c.value ] )
    );
    expect( byName['cost:llm:request'] ).toBeCloseTo( 0.3829, 10 );
    expect( byName['cost:http:request'] ).toBeCloseTo( 0.04, 10 );
    expect( byName.other ).toBe( 0 );
    expect( res.body.attributes.cost.total ).toBeCloseTo( 0.4229, 10 );

    expect( mockGetWorkflowResult ).toHaveBeenCalledWith( 'test-workflow-id', undefined );
    expect( mockFetchTraceFromS3 ).toHaveBeenCalledWith( REMOTE_URL );
  } );

  it( 'returns the same payload shape for the pinned-run route', async () => {
    mockGetWorkflowResult.mockResolvedValue( {
      workflowId: 'test-workflow-id',
      runId: RID,
      trace: { destinations: { local: null, remote: REMOTE_URL } }
    } );
    mockFetchTraceFromS3.mockResolvedValue( fixtureTrace() );

    const res = await request( createApp() )
      .get( `/workflow/test-workflow-id/runs/${RID}/trace-attributes` )
      .expect( 200 );

    expect( res.body.runId ).toBe( RID );
    expect( res.body.traceUrl ).toBe( REMOTE_URL );
    expect( mockGetWorkflowResult ).toHaveBeenCalledWith( 'test-workflow-id', RID );
  } );

  it( 'succeeds against a legacy trace file lacking attributes.token_usage by falling back to output.usage', async () => {
    mockGetWorkflowResult.mockResolvedValue( {
      workflowId: 'test-workflow-id',
      runId: 'r-legacy',
      trace: { destinations: { local: null, remote: REMOTE_URL } }
    } );
    mockFetchTraceFromS3.mockResolvedValue( {
      id: 'wf',
      kind: 'workflow',
      name: 'simple',
      startedAt: 1000,
      endedAt: 2000,
      attributes: {},
      children: [
        {
          id: 'llm-legacy',
          kind: 'llm',
          name: 'llm',
          startedAt: 1100,
          endedAt: 1900,
          attributes: { cost: { total: 0.10 } },
          output: { result: '...', usage: { inputTokens: 800, outputTokens: 200, totalTokens: 1000 } },
          children: []
        }
      ]
    } );

    const res = await request( createApp() )
      .get( '/workflow/test-workflow-id/trace-attributes' )
      .expect( 200 );

    expect( res.body.attributes.tokenUsage ).toEqual( {
      inputTokens: 800,
      outputTokens: 200,
      cachedInputTokens: 0,
      totalTokens: 1000
    } );
    expect( res.body.attributes.cost.total ).toBeCloseTo( 0.10, 10 );
  } );

  it( 'returns 424 when the workflow is still running', async () => {
    mockGetWorkflowResult.mockRejectedValue( new WorkflowNotCompletedError() );

    await request( createApp() )
      .get( '/workflow/test-workflow-id/trace-attributes' )
      .expect( 424, {
        error: 'WorkflowNotCompletedError',
        message: 'Workflow execution is not complete.'
      } );

    expect( mockFetchTraceFromS3 ).not.toHaveBeenCalled();
  } );

  it( 'returns 424 on the pinned-run route when the run is still running', async () => {
    mockGetWorkflowResult.mockRejectedValue( new WorkflowNotCompletedError() );

    await request( createApp() )
      .get( `/workflow/test-workflow-id/runs/${RID}/trace-attributes` )
      .expect( 424 );
  } );

  it( 'returns 404 when the workflow id is unknown', async () => {
    // Mirror the WorkflowNotFoundError shape from @temporalio/client.
    class WorkflowNotFoundError extends Error {
      constructor( message ) {
        super( message );
        this.name = 'WorkflowNotFoundError';
      }
    }
    Object.defineProperty( WorkflowNotFoundError.prototype.constructor, 'name', { value: 'WorkflowNotFoundError' } );
    mockGetWorkflowResult.mockRejectedValue( new WorkflowNotFoundError( 'Workflow "unknown-id" not found' ) );

    await request( createApp() )
      .get( '/workflow/unknown-id/trace-attributes' )
      .expect( 404 );
  } );

  it( 'returns 404 with TraceNotAvailableError when the run completed but has no remote trace destination', async () => {
    mockGetWorkflowResult.mockResolvedValue( {
      workflowId: 'test-workflow-id',
      runId: 'r-no-trace',
      trace: { destinations: { local: '/tmp/t.json', remote: null } }
    } );

    await request( createApp() )
      .get( '/workflow/test-workflow-id/trace-attributes' )
      .expect( 404, {
        error: 'TraceNotAvailableError',
        message: 'No trace available for workflow "test-workflow-id".',
        workflowId: 'test-workflow-id'
      } );

    expect( mockFetchTraceFromS3 ).not.toHaveBeenCalled();
  } );

  it( 'returns 400 when the pinned rid is not a valid UUID', async () => {
    await request( createApp() )
      .get( '/workflow/test-workflow-id/runs/not-a-uuid/trace-attributes' )
      .expect( 400 );

    expect( mockGetWorkflowResult ).not.toHaveBeenCalled();
  } );

  it( 'forwards S3 errors through the error handler', async () => {
    mockGetWorkflowResult.mockResolvedValue( {
      workflowId: 'test-workflow-id',
      runId: 'r-1',
      trace: { destinations: { local: null, remote: REMOTE_URL } }
    } );
    mockFetchTraceFromS3.mockRejectedValue( new Error( 'S3 access denied' ) );

    const app = express();
    app.get( '/workflow/:id/trace-attributes', createTraceAttributesHandler( mockClient ) );
    app.use( ( err, _req, res, _next ) => res.status( 500 ).json( { error: err.message } ) );

    await request( app )
      .get( '/workflow/test-workflow-id/trace-attributes' )
      .expect( 500, { error: 'S3 access denied' } );
  } );

  it( 'returns null startTime / finishTime / runtime when the trace root lacks timestamps', async () => {
    mockGetWorkflowResult.mockResolvedValue( {
      workflowId: 'test-workflow-id',
      runId: 'r-1',
      trace: { destinations: { local: null, remote: REMOTE_URL } }
    } );
    mockFetchTraceFromS3.mockResolvedValue( {
      // Malformed root — no startedAt / endedAt fields at all.
      id: 'wf',
      kind: 'workflow',
      name: 'simple',
      attributes: {},
      children: []
    } );

    const res = await request( createApp() )
      .get( '/workflow/test-workflow-id/trace-attributes' )
      .expect( 200 );

    expect( res.body.startTime ).toBeNull();
    expect( res.body.finishTime ).toBeNull();
    expect( res.body.runtime ).toBeNull();
  } );

  it( 'traceUrl matches the S3 URL returned by /trace-log for the same run', async () => {
    // Both endpoints read result.trace.destinations.remote — same source means same value.
    mockGetWorkflowResult.mockResolvedValue( {
      workflowId: 'test-workflow-id',
      runId: 'r-1',
      trace: { destinations: { local: null, remote: REMOTE_URL } }
    } );
    mockFetchTraceFromS3.mockResolvedValue( fixtureTrace() );

    const res = await request( createApp() )
      .get( '/workflow/test-workflow-id/trace-attributes' )
      .expect( 200 );

    expect( res.body.traceUrl ).toBe( REMOTE_URL );
  } );
} );
