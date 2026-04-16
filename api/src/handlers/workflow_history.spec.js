import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createWorkflowHistoryHandler } from './workflow_history.js';

describe( 'workflow_history handler', () => {
  const mockGetWorkflowHistory = vi.fn();
  const mockClient = { getWorkflowHistory: mockGetWorkflowHistory };

  const createApp = () => {
    const app = express();
    app.get( '/workflow/:id/history', createWorkflowHistoryHandler( mockClient ) );
    app.use( ( err, _req, res, _next ) => {
      if ( err.name === 'ZodError' ) {
        res.status( 400 ).json( { error: 'ValidationError', issues: err.issues } );
        return;
      }
      res.status( 500 ).json( { error: err.message } );
    } );
    return app;
  };

  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'returns events and workflow metadata on first page', async () => {
    const historyResult = {
      workflow: {
        workflowId: 'wf-123',
        runId: 'run-abc',
        status: 'running',
        startTime: '2024-04-15T12:00:00.000Z',
        closeTime: null,
        historyLength: 42,
        taskQueue: 'default'
      },
      events: [ { eventId: '1', eventTypeName: 'WORKFLOW_EXECUTION_STARTED' } ],
      nextPageToken: null
    };
    mockGetWorkflowHistory.mockResolvedValue( historyResult );

    const res = await request( createApp() )
      .get( '/workflow/wf-123/history' )
      .expect( 200 );

    expect( res.body ).toEqual( historyResult );
    expect( mockGetWorkflowHistory ).toHaveBeenCalledWith( 'wf-123', {
      runId: undefined,
      pageSize: 20,
      pageToken: undefined,
      includePayloads: false
    } );
  } );

  it( 'passes query params to client', async () => {
    mockGetWorkflowHistory.mockResolvedValue( { workflow: null, events: [], nextPageToken: null } );
    const token = Buffer.from( 'page-data' ).toString( 'base64' );

    await request( createApp() )
      .get( `/workflow/wf-123/history?runId=run-abc&pageSize=30&pageToken=${token}&includePayloads=true` )
      .expect( 200 );

    expect( mockGetWorkflowHistory ).toHaveBeenCalledWith( 'wf-123', {
      runId: 'run-abc',
      pageSize: 30,
      pageToken: token,
      includePayloads: true
    } );
  } );

  it( 'defaults pageSize to 20 and includePayloads to false', async () => {
    mockGetWorkflowHistory.mockResolvedValue( { workflow: null, events: [], nextPageToken: null } );

    await request( createApp() )
      .get( '/workflow/wf-123/history' )
      .expect( 200 );

    expect( mockGetWorkflowHistory ).toHaveBeenCalledWith( 'wf-123', expect.objectContaining( {
      pageSize: 20,
      includePayloads: false
    } ) );
  } );

  it( 'treats includePayloads=false as false (not Boolean coercion)', async () => {
    mockGetWorkflowHistory.mockResolvedValue( { workflow: null, events: [], nextPageToken: null } );

    await request( createApp() )
      .get( '/workflow/wf-123/history?includePayloads=false' )
      .expect( 200 );

    expect( mockGetWorkflowHistory ).toHaveBeenCalledWith( 'wf-123', expect.objectContaining( {
      includePayloads: false
    } ) );
  } );

  it( 'rejects non-boolean includePayloads values', async () => {
    await request( createApp() )
      .get( '/workflow/wf-123/history?includePayloads=yes' )
      .expect( 400 );
  } );

  it( 'rejects pageSize below 1', async () => {
    await request( createApp() )
      .get( '/workflow/wf-123/history?pageSize=0' )
      .expect( 400 );
  } );

  it( 'rejects pageSize above 50', async () => {
    await request( createApp() )
      .get( '/workflow/wf-123/history?pageSize=51' )
      .expect( 400 );
  } );

  it( 'rejects non-numeric pageSize', async () => {
    await request( createApp() )
      .get( '/workflow/wf-123/history?pageSize=abc' )
      .expect( 400 );
  } );

  it( 'rejects negative pageSize', async () => {
    await request( createApp() )
      .get( '/workflow/wf-123/history?pageSize=-5' )
      .expect( 400 );
  } );

  it( 'rejects non-integer pageSize', async () => {
    await request( createApp() )
      .get( '/workflow/wf-123/history?pageSize=20.5' )
      .expect( 400 );
  } );

  it( 'treats empty pageToken as first page', async () => {
    mockGetWorkflowHistory.mockResolvedValue( { workflow: null, events: [], nextPageToken: null } );

    await request( createApp() )
      .get( '/workflow/wf-123/history?pageToken=' )
      .expect( 200 );

    expect( mockGetWorkflowHistory ).toHaveBeenCalledWith( 'wf-123', expect.objectContaining( {
      pageToken: undefined
    } ) );
  } );

  it( 'rejects malformed pageToken', async () => {
    await request( createApp() )
      .get( '/workflow/wf-123/history?runId=run-abc&pageToken=not!base64' )
      .expect( 400 );
  } );

  it( 'rejects pageToken without runId', async () => {
    const token = Buffer.from( 'page-data' ).toString( 'base64' );

    const res = await request( createApp() )
      .get( `/workflow/wf-123/history?pageToken=${token}` )
      .expect( 400 );

    expect( res.body.issues[0].message ).toBe( 'runId is required when using pageToken' );
  } );

  it( 'passes errors to next()', async () => {
    const error = new Error( 'Workflow not found' );
    mockGetWorkflowHistory.mockRejectedValue( error );

    await request( createApp() )
      .get( '/workflow/wf-123/history' )
      .expect( 500, { error: 'Workflow not found' } );
  } );
} );
