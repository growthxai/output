import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const RID = '11111111-2222-4333-8444-555555555555';

vi.mock( '#configs', () => ( { isProduction: false } ) );
vi.mock( '#logger', () => ( {
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), http: vi.fn() }
} ) );

import { createStopHandler, createTerminateHandler, createResultHandler } from './workflow_run.js';
import errorHandler from '../middleware/error_handler.js';

describe( 'workflow_run handlers', () => {
  const mockStopWorkflow = vi.fn();
  const mockTerminateWorkflow = vi.fn();
  const mockGetWorkflowResult = vi.fn();
  const mockClient = { stopWorkflow: mockStopWorkflow, terminateWorkflow: mockTerminateWorkflow, getWorkflowResult: mockGetWorkflowResult };

  beforeEach( () => vi.clearAllMocks() );

  describe( 'createStopHandler', () => {
    const app = () => {
      const handler = createStopHandler( mockClient );
      const a = express();
      a.patch( '/workflow/:id/stop', handler );
      a.patch( '/workflow/:id/runs/:rid/stop', handler );
      a.use( errorHandler );
      return a;
    };

    it( 'stops the workflow and returns the result', async () => {
      mockStopWorkflow.mockResolvedValue( { workflowId: 'w1', status: 'stopped' } );

      const res = await request( app() ).patch( '/workflow/w1/stop' ).expect( 200 );

      expect( res.body ).toEqual( { workflowId: 'w1', status: 'stopped' } );
      expect( mockStopWorkflow ).toHaveBeenCalledWith( 'w1', undefined );
    } );

    it( 'forwards the pinned rid', async () => {
      mockStopWorkflow.mockResolvedValue( {} );

      await request( app() ).patch( `/workflow/w1/runs/${RID}/stop` ).expect( 200 );

      expect( mockStopWorkflow ).toHaveBeenCalledWith( 'w1', RID );
    } );

    it( 'returns 400 for an invalid rid', async () => {
      await request( app() ).patch( '/workflow/w1/runs/not-a-uuid/stop' ).expect( 400 );
      expect( mockStopWorkflow ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'createTerminateHandler', () => {
    const app = () => {
      const handler = createTerminateHandler( mockClient );
      const a = express();
      a.use( express.json() );
      a.post( '/workflow/:id/terminate', handler );
      a.post( '/workflow/:id/runs/:rid/terminate', handler );
      a.use( errorHandler );
      return a;
    };

    it( 'terminates the workflow and includes terminated: true', async () => {
      mockTerminateWorkflow.mockResolvedValue( { workflowId: 'w1', runId: RID } );

      const res = await request( app() ).post( '/workflow/w1/terminate' ).expect( 200 );

      expect( res.body ).toEqual( { terminated: true, workflowId: 'w1', runId: RID } );
      expect( mockTerminateWorkflow ).toHaveBeenCalledWith( 'w1', undefined, undefined );
    } );

    it( 'passes the reason from the request body', async () => {
      mockTerminateWorkflow.mockResolvedValue( {} );

      await request( app() ).post( '/workflow/w1/terminate' ).send( { reason: 'stuck' } ).expect( 200 );

      expect( mockTerminateWorkflow ).toHaveBeenCalledWith( 'w1', 'stuck', undefined );
    } );

    it( 'forwards the pinned rid', async () => {
      mockTerminateWorkflow.mockResolvedValue( {} );

      await request( app() ).post( `/workflow/w1/runs/${RID}/terminate` ).expect( 200 );

      expect( mockTerminateWorkflow ).toHaveBeenCalledWith( 'w1', undefined, RID );
    } );

    it( 'returns 400 for an invalid rid', async () => {
      await request( app() ).post( '/workflow/w1/runs/not-a-uuid/terminate' ).expect( 400 );
      expect( mockTerminateWorkflow ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'createResultHandler', () => {
    const app = () => {
      const handler = createResultHandler( mockClient );
      const a = express();
      a.get( '/workflow/:id/result', handler );
      a.get( '/workflow/:id/runs/:rid/result', handler );
      a.use( errorHandler );
      return a;
    };

    it( 'returns the workflow result', async () => {
      mockGetWorkflowResult.mockResolvedValue( { workflowId: 'w1', status: 'completed', output: { ok: true } } );

      const res = await request( app() ).get( '/workflow/w1/result' ).expect( 200 );

      expect( res.body ).toEqual( { workflowId: 'w1', status: 'completed', output: { ok: true } } );
      expect( mockGetWorkflowResult ).toHaveBeenCalledWith( 'w1', undefined );
    } );

    it( 'forwards the pinned rid', async () => {
      mockGetWorkflowResult.mockResolvedValue( {} );

      await request( app() ).get( `/workflow/w1/runs/${RID}/result` ).expect( 200 );

      expect( mockGetWorkflowResult ).toHaveBeenCalledWith( 'w1', RID );
    } );

    it( 'returns 400 for an invalid rid', async () => {
      await request( app() ).get( '/workflow/w1/runs/not-a-uuid/result' ).expect( 400 );
      expect( mockGetWorkflowResult ).not.toHaveBeenCalled();
    } );
  } );
} );
