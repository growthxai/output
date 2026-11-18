import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const RID = '11111111-2222-4333-8444-555555555555';

vi.mock( '#configs', () => ( { isProduction: false } ) );
vi.mock( '#logger', () => ( {
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), http: vi.fn() }
} ) );

import { createStopHandler, createTerminateHandler, createResultHandler, createInputHandler } from './workflow_run.js';
import { workflowNotFoundError } from '../clients/errors.js';
import errorHandler from '../middleware/error_handler.js';

describe( 'workflow_run handlers', () => {
  const mockStopWorkflow = vi.fn();
  const mockTerminateWorkflow = vi.fn();
  const mockGetWorkflowResult = vi.fn();
  const mockGetWorkflowInput = vi.fn();
  const mockClient = {
    workflow: {
      stop: mockStopWorkflow,
      terminate: mockTerminateWorkflow,
      getResult: mockGetWorkflowResult,
      getInput: mockGetWorkflowInput
    }
  };

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

  describe( 'createInputHandler', () => {
    const app = () => {
      const handler = createInputHandler( mockClient );
      const a = express();
      a.get( '/workflow/:id/input', handler );
      a.get( '/workflow/:id/runs/:rid/input', handler );
      a.use( errorHandler );
      return a;
    };

    it( 'returns the workflow input', async () => {
      mockGetWorkflowInput.mockResolvedValue( { workflowId: 'w1', runId: RID, input: { values: [ 1, 2 ] } } );

      const res = await request( app() ).get( '/workflow/w1/input' ).expect( 200 );

      expect( res.body ).toEqual( { workflowId: 'w1', runId: RID, input: { values: [ 1, 2 ] } } );
      expect( mockGetWorkflowInput ).toHaveBeenCalledWith( 'w1', undefined );
    } );

    it( 'forwards the pinned rid', async () => {
      mockGetWorkflowInput.mockResolvedValue( {} );

      await request( app() ).get( `/workflow/w1/runs/${RID}/input` ).expect( 200 );

      expect( mockGetWorkflowInput ).toHaveBeenCalledWith( 'w1', RID );
    } );

    it( 'returns 400 for an invalid rid', async () => {
      await request( app() ).get( '/workflow/w1/runs/not-a-uuid/input' ).expect( 400 );
      expect( mockGetWorkflowInput ).not.toHaveBeenCalled();
    } );

    it( 'maps a WorkflowNotFoundError to a 404', async () => {
      mockGetWorkflowInput.mockRejectedValue( workflowNotFoundError( 'w1' ) );

      await request( app() ).get( '/workflow/w1/input' ).expect( 404, {
        error: 'WorkflowNotFoundError',
        message: 'Workflow "w1" not found',
        workflowId: 'w1'
      } );
    } );
  } );
} );
