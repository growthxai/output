import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';

const { mockClient } = vi.hoisted( () => {
  const runWorkflow = vi.fn();
  const startWorkflow = vi.fn();
  const getWorkflowStatus = vi.fn();
  const stopWorkflow = vi.fn();
  const terminateWorkflow = vi.fn();
  const getWorkflowResult = vi.fn();
  const resetWorkflow = vi.fn();
  const queryWorkflow = vi.fn();
  const listWorkflowRuns = vi.fn();
  const sendSignal = vi.fn();
  const sendQuery = vi.fn();
  const executeUpdate = vi.fn();
  const close = () => Promise.resolve();
  return {
    mockClient: {
      runWorkflow,
      startWorkflow,
      getWorkflowStatus,
      stopWorkflow,
      terminateWorkflow,
      getWorkflowResult,
      resetWorkflow,
      queryWorkflow,
      listWorkflowRuns,
      sendSignal,
      sendQuery,
      executeUpdate,
      close
    }
  };
} );

vi.mock( './clients/temporal_client.js', async () => {
  const { WorkflowNotFoundError, WorkflowNotCompletedError, WorkflowExecutionTimedOutError } =
    await import( './clients/errors.js' );
  return {
    default: { init: () => Promise.resolve( mockClient ) },
    WorkflowNotFoundError,
    WorkflowNotCompletedError,
    WorkflowExecutionTimedOutError
  };
} );

vi.mock( '#configs', () => ( {
  api: {
    authToken: 'test-token',
    defaultCatalogWorkflow: 'default-catalog',
    port: 3000,
    envName: 'test'
  },
  temporal: {
    address: 'localhost:7233',
    apiKey: null,
    namespace: 'default',
    defaultTaskQueue: 'default-catalog',
    workflowExecutionTimeout: '24h',
    workflowExecutionMaxWaiting: 300_000
  },
  isProduction: false
} ) );

vi.mock( '#logger', () => ( {
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    http: vi.fn()
  }
} ) );

const PORT = 3000;

describe( 'API endpoints', () => {
  beforeAll( async () => {
    await import( './api.js' );
  } );

  beforeEach( () => {
    vi.clearAllMocks();
    mockClient.runWorkflow.mockResolvedValue( { workflowId: 'run-1', output: null, trace: null, status: 'completed', error: null } );
    mockClient.startWorkflow.mockResolvedValue( { workflowId: 'start-1' } );
    mockClient.getWorkflowStatus.mockResolvedValue( { workflowId: 'w1', status: 'running', startedAt: 0, completedAt: null } );
    mockClient.stopWorkflow.mockResolvedValue( { workflowId: 'w1' } );
    mockClient.terminateWorkflow.mockResolvedValue( undefined );
    mockClient.resetWorkflow.mockResolvedValue( { workflowId: 'w1', runId: 'new-run-123' } );
    mockClient.getWorkflowResult.mockResolvedValue( {
      workflowId: 'w1',
      output: { done: true },
      trace: { destinations: { local: '/tmp/trace.json', remote: null } },
      status: 'completed',
      error: null
    } );
    mockClient.queryWorkflow.mockResolvedValue( { workflows: [] } );
    mockClient.listWorkflowRuns.mockResolvedValue( { runs: [] } );
    mockClient.sendSignal.mockResolvedValue( undefined );
    mockClient.sendQuery.mockResolvedValue( { data: null } );
    mockClient.executeUpdate.mockResolvedValue( { result: null } );
  } );

  describe( 'GET /health', () => {
    it( 'returns 200 when healthy', () => request( `http://localhost:${PORT}` ).get( '/health' ).expect( 200 ) );
  } );

  describe( 'POST /heartbeat', () => {
    it( 'returns 204 with no body', () => request( `http://localhost:${PORT}` ).post( '/heartbeat' ).expect( 204 ) );
  } );

  describe( 'POST /workflow/run', () => {
    it( 'returns completed workflow result and calls runWorkflow with input', async () => {
      const res = await request( `http://localhost:${PORT}` )
        .post( '/workflow/run' )
        .send( { workflowName: 'MyWorkflow', input: { x: 1 } } )
        .expect( 200 );
      expect( res.body ).toMatchObject( { workflowId: 'run-1', status: 'completed' } );
      expect( mockClient.runWorkflow ).toHaveBeenCalledWith( 'MyWorkflow', { x: 1 }, expect.any( Object ) );
    } );

    it( 'validation error returns 400', async () => {
      const res = await request( `http://localhost:${PORT}` ).post( '/workflow/run' ).send( { input: { x: 1 } } ).expect( 400 );
      expect( res.body ).toMatchObject( { error: 'ValidationError', message: 'Invalid Payload' } );
      expect( res.body.issues ).toBeDefined();
      expect( mockClient.runWorkflow ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'POST /workflow/start', () => {
    it( 'returns workflowId and calls startWorkflow with input', async () => {
      const res = await request( `http://localhost:${PORT}` )
        .post( '/workflow/start' )
        .send( { workflowName: 'MyWorkflow', input: {} } )
        .expect( 200 );
      expect( res.body ).toEqual( { workflowId: 'start-1' } );
      expect( mockClient.startWorkflow ).toHaveBeenCalledWith( 'MyWorkflow', {}, expect.any( Object ) );
    } );

    it( 'validation error returns 400', async () => {
      await request( `http://localhost:${PORT}` ).post( '/workflow/start' ).send( {} ).expect( 400 );
      expect( mockClient.startWorkflow ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'GET /workflow/:id/status', () => {
    it( 'returns workflow status for given id', async () => {
      const res = await request( `http://localhost:${PORT}` ).get( '/workflow/w1/status' ).expect( 200 );
      expect( res.body ).toMatchObject( { workflowId: 'w1', status: 'running' } );
      expect( mockClient.getWorkflowStatus ).toHaveBeenCalledWith( 'w1' );
    } );
  } );

  describe( 'PATCH /workflow/:id/stop', () => {
    it( 'returns workflowId after stopping workflow', async () => {
      const res = await request( `http://localhost:${PORT}` ).patch( '/workflow/w1/stop' ).expect( 200 );
      expect( res.body ).toEqual( { workflowId: 'w1' } );
      expect( mockClient.stopWorkflow ).toHaveBeenCalledWith( 'w1' );
    } );
  } );

  describe( 'POST /workflow/:id/terminate', () => {
    it( 'returns terminated true and workflowId when reason provided', async () => {
      const res = await request( `http://localhost:${PORT}` )
        .post( '/workflow/w1/terminate' )
        .send( { reason: 'test reason' } )
        .expect( 200 );
      expect( res.body ).toEqual( { terminated: true, workflowId: 'w1' } );
      expect( mockClient.terminateWorkflow ).toHaveBeenCalledWith( 'w1', 'test reason' );
    } );

    it( 'works without body', async () => {
      const res = await request( `http://localhost:${PORT}` ).post( '/workflow/w1/terminate' ).expect( 200 );
      expect( res.body ).toEqual( { terminated: true, workflowId: 'w1' } );
      expect( mockClient.terminateWorkflow ).toHaveBeenCalledWith( 'w1', undefined );
    } );

    it( 'validation error when reason is not string returns 400', async () => {
      await request( `http://localhost:${PORT}` ).post( '/workflow/w1/terminate' ).send( { reason: 123 } ).expect( 400 );
      expect( mockClient.terminateWorkflow ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'POST /workflow/:id/reset', () => {
    it( 'returns workflowId and runId when reset is successful', async () => {
      const res = await request( `http://localhost:${PORT}` )
        .post( '/workflow/w1/reset' )
        .send( { stepName: 'generateBlogPost', reason: 'retry with new prompt' } )
        .expect( 200 );
      expect( res.body ).toEqual( { workflowId: 'w1', runId: 'new-run-123' } );
      expect( mockClient.resetWorkflow ).toHaveBeenCalledWith( 'w1', 'generateBlogPost', 'retry with new prompt' );
    } );

    it( 'works without reason', async () => {
      const res = await request( `http://localhost:${PORT}` )
        .post( '/workflow/w1/reset' )
        .send( { stepName: 'generateBlogPost' } )
        .expect( 200 );
      expect( res.body ).toEqual( { workflowId: 'w1', runId: 'new-run-123' } );
      expect( mockClient.resetWorkflow ).toHaveBeenCalledWith( 'w1', 'generateBlogPost', undefined );
    } );

    it( 'validation error when stepName is missing returns 400', async () => {
      await request( `http://localhost:${PORT}` )
        .post( '/workflow/w1/reset' )
        .send( { reason: 'no step' } )
        .expect( 400 );
      expect( mockClient.resetWorkflow ).not.toHaveBeenCalled();
    } );

    it( 'validation error when stepName is not a string returns 400', async () => {
      await request( `http://localhost:${PORT}` )
        .post( '/workflow/w1/reset' )
        .send( { stepName: 123 } )
        .expect( 400 );
      expect( mockClient.resetWorkflow ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'GET /workflow/:id/result', () => {
    it( 'returns workflow output and status when completed', async () => {
      const res = await request( `http://localhost:${PORT}` ).get( '/workflow/w1/result' ).expect( 200 );
      expect( res.body ).toMatchObject( { workflowId: 'w1', status: 'completed', output: { done: true } } );
      expect( mockClient.getWorkflowResult ).toHaveBeenCalledWith( 'w1' );
    } );
  } );

  describe( 'GET /workflow/:id/trace-log', () => {
    it( 'returns local trace path when trace is stored locally', async () => {
      const res = await request( `http://localhost:${PORT}` ).get( '/workflow/w1/trace-log' ).expect( 200 );
      expect( res.body ).toEqual( { source: 'local', localPath: '/tmp/trace.json' } );
      expect( mockClient.getWorkflowResult ).toHaveBeenCalledWith( 'w1' );
    } );
  } );

  describe( 'GET /workflow/catalog/:id', () => {
    it( 'returns workflows from catalog by id via queryWorkflow', async () => {
      const res = await request( `http://localhost:${PORT}` ).get( '/workflow/catalog/cat-1' ).expect( 200 );
      expect( res.body ).toEqual( { workflows: [] } );
      expect( mockClient.queryWorkflow ).toHaveBeenCalledWith( 'cat-1', 'get' );
    } );
  } );

  describe( 'GET /workflow/catalog', () => {
    it( 'returns default catalog workflows when no id in path', async () => {
      const res = await request( `http://localhost:${PORT}` ).get( '/workflow/catalog' ).expect( 200 );
      expect( res.body ).toEqual( { workflows: [] } );
      expect( mockClient.queryWorkflow ).toHaveBeenCalledWith( 'default-catalog', 'get' );
    } );
  } );

  describe( 'GET /workflow/runs', () => {
    it( 'returns list of workflow runs from listWorkflowRuns', async () => {
      const res = await request( `http://localhost:${PORT}` ).get( '/workflow/runs' ).expect( 200 );
      expect( res.body ).toEqual( { runs: [] } );
      expect( mockClient.listWorkflowRuns ).toHaveBeenCalledWith( expect.any( Object ) );
    } );

    it( 'validation error when limit is out of range returns 400', async () => {
      const res = await request( `http://localhost:${PORT}` ).get( '/workflow/runs?limit=0' ).expect( 400 );
      expect( res.body ).toMatchObject( { error: 'ValidationError', message: 'Invalid Payload' } );
      expect( res.body.issues ).toBeDefined();
      expect( mockClient.listWorkflowRuns ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'POST /workflow/:id/feedback', () => {
    it( 'preserves payload properties', async () => {
      const payload = { score: 5, comment: 'Great work!', approved: true };
      await request( `http://localhost:${PORT}` ).post( '/workflow/w1/feedback' ).send( { payload } ).expect( 200 );
      expect( mockClient.sendSignal ).toHaveBeenCalledWith( 'w1', 'resume', payload );
    } );

    it( 'accepts request with no payload and sends undefined to workflow', async () => {
      await request( `http://localhost:${PORT}` ).post( '/workflow/w1/feedback' ).expect( 200 );
      expect( mockClient.sendSignal ).toHaveBeenCalledWith( 'w1', 'resume', undefined );
    } );

    it( 'validation error when payload is not object returns 400', async () => {
      await request( `http://localhost:${PORT}` ).post( '/workflow/w1/feedback' ).send( { payload: 'not-an-object' } ).expect( 400 );
      expect( mockClient.sendSignal ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'POST /workflow/:id/update/:update', () => {
    it( 'returns update result and calls executeUpdate with payload', async () => {
      mockClient.executeUpdate.mockResolvedValue( { result: { accepted: true } } );
      const res = await request( `http://localhost:${PORT}` )
        .post( '/workflow/w1/update/approve' )
        .send( { payload: { reason: 'ok' } } )
        .expect( 200 );
      expect( res.body ).toEqual( { result: { accepted: true } } );
      expect( mockClient.executeUpdate ).toHaveBeenCalledWith( 'w1', 'approve', { reason: 'ok' } );
    } );

    it( 'works with no payload', async () => {
      mockClient.executeUpdate.mockResolvedValue( { result: null } );
      await request( `http://localhost:${PORT}` ).post( '/workflow/w1/update/ping' ).expect( 200 );
      expect( mockClient.executeUpdate ).toHaveBeenCalledWith( 'w1', 'ping', undefined );
    } );
  } );

  describe( 'POST /workflow/:id/signal/:signal', () => {
    it( 'sends signal with payload and returns 200', async () => {
      await request( `http://localhost:${PORT}` )
        .post( '/workflow/w1/signal/cancel' )
        .send( { payload: { reason: 'done' } } )
        .expect( 200 );
      expect( mockClient.sendSignal ).toHaveBeenCalledWith( 'w1', 'cancel', { reason: 'done' } );
    } );

    it( 'works with no payload', async () => {
      await request( `http://localhost:${PORT}` ).post( '/workflow/w1/signal/ping' ).expect( 200 );
      expect( mockClient.sendSignal ).toHaveBeenCalledWith( 'w1', 'ping', undefined );
    } );
  } );

  describe( 'POST /workflow/:id/query/:query', () => {
    it( 'returns query result and calls sendQuery with payload', async () => {
      mockClient.sendQuery.mockResolvedValue( { data: { count: 42 } } );
      const res = await request( `http://localhost:${PORT}` )
        .post( '/workflow/w1/query/getState' )
        .send( { payload: { key: 'x' } } )
        .expect( 200 );
      expect( res.body ).toEqual( { data: { count: 42 } } );
      expect( mockClient.sendQuery ).toHaveBeenCalledWith( 'w1', 'getState', { key: 'x' } );
    } );

    it( 'works with no payload', async () => {
      mockClient.sendQuery.mockResolvedValue( { data: null } );
      await request( `http://localhost:${PORT}` ).post( '/workflow/w1/query/getState' ).expect( 200 );
      expect( mockClient.sendQuery ).toHaveBeenCalledWith( 'w1', 'getState', undefined );
    } );
  } );

  describe( 'unknown route', () => {
    it( 'returns 404', () => request( `http://localhost:${PORT}` ).get( '/unknown' ).expect( 404 ) );
  } );
} );
