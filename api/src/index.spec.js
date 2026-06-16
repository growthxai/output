import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';

const RID = '11111111-2222-4333-8444-555555555555';

const { mockClient, mockLogger, temporalInitState, mockTemporalInit } = vi.hoisted( () => {
  const temporalInitState = { options: null };
  const mockClient = {
    workflow: {
      run: vi.fn(),
      start: vi.fn(),
      getStatus: vi.fn(),
      stop: vi.fn(),
      terminate: vi.fn(),
      getResult: vi.fn(),
      getHistory: vi.fn(),
      reset: vi.fn(),
      query: vi.fn(),
      listRuns: vi.fn(),
      signal: vi.fn(),
      executeUpdate: vi.fn()
    },
    close: () => Promise.resolve(),
    isReady: vi.fn( () => true )
  };
  const mockTemporalInit = vi.fn( options => {
    temporalInitState.options = options;
    return Promise.resolve( mockClient );
  } );

  return {
    mockClient,
    mockTemporalInit,
    temporalInitState,
    mockLogger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      http: vi.fn()
    }
  };
} );

vi.mock( './clients/temporal/index.js', async () => {
  const { WorkflowNotFoundError, WorkflowNotCompletedError, WorkflowExecutionTimedOutError } =
    await import( './clients/errors.js' );
  return {
    default: { init: mockTemporalInit },
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

vi.mock( '#logger', () => ( { logger: mockLogger } ) );

const PORT = 3000;

describe( 'API endpoints', () => {
  beforeAll( async () => {
    await import( './index.js' );
  } );

  beforeEach( () => {
    vi.clearAllMocks();
    mockClient.workflow.run.mockResolvedValue( { workflowId: 'run-1', runId: 'r1', output: null, trace: null, status: 'completed', error: null } );
    mockClient.workflow.start.mockResolvedValue( { workflowId: 'start-1', runId: 'r-start' } );
    mockClient.workflow.getStatus.mockResolvedValue( { workflowId: 'w1', runId: 'r1', status: 'running', startedAt: 0, completedAt: null } );
    mockClient.workflow.stop.mockResolvedValue( { workflowId: 'w1', runId: 'r1' } );
    mockClient.workflow.terminate.mockResolvedValue( { workflowId: 'w1', runId: 'r1' } );
    mockClient.workflow.reset.mockResolvedValue( { workflowId: 'w1', runId: 'new-run-123' } );
    mockClient.workflow.getResult.mockResolvedValue( {
      workflowId: 'w1',
      runId: 'r1',
      status: 'completed',
      input: { some: 'input' },
      output: { done: true },
      trace: { destinations: { local: '/tmp/trace.json', remote: null } },
      error: null
    } );
    mockClient.workflow.getHistory.mockResolvedValue( {
      workflow: {
        workflowId: 'w1', runId: 'run-1', status: 'running',
        startTime: '2024-04-15T12:00:00.000Z', closeTime: null,
        historyLength: 10, taskQueue: 'default'
      },
      events: [ { eventId: '1', eventTypeName: 'WORKFLOW_EXECUTION_STARTED' } ],
      nextPageToken: null
    } );
    mockClient.workflow.query.mockResolvedValue( { workflows: [] } );
    mockClient.workflow.listRuns.mockResolvedValue( { runs: [] } );
    mockClient.workflow.signal.mockResolvedValue( undefined );
    mockClient.workflow.executeUpdate.mockResolvedValue( { result: null } );
  } );

  describe( 'GET /health', () => {
    it( 'returns 200 when healthy', () => request( `http://localhost:${PORT}` ).get( '/health' ).expect( 200 ) );
  } );

  it( 'logs and exits when the Temporal connection is lost', () => {
    const exit = vi.spyOn( process, 'exit' ).mockImplementation( code => {
      throw new Error( `process.exit ${code}` );
    } );
    const error = new Error( 'Temporal unavailable' );

    expect( () => temporalInitState.options.onConnectionLost( error ) ).toThrow( 'process.exit 1' );

    expect( mockLogger.error ).toHaveBeenCalledWith( 'Temporal connection lost', {
      error: 'Temporal unavailable',
      errorType: 'Error',
      stack: error.stack
    } );
    expect( exit ).toHaveBeenCalledWith( 1 );

    exit.mockRestore();
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
      expect( mockClient.workflow.run ).toHaveBeenCalledWith( 'MyWorkflow', { x: 1 }, expect.any( Object ) );
    } );

    it( 'forwards catalog body field as taskQueue to runWorkflow', async () => {
      await request( `http://localhost:${PORT}` )
        .post( '/workflow/run' )
        .send( { workflowName: 'MyWorkflow', input: {}, catalog: 'sepcat' } )
        .expect( 200 );
      expect( mockClient.workflow.run ).toHaveBeenCalledWith( 'MyWorkflow', {}, expect.objectContaining( { taskQueue: 'sepcat' } ) );
    } );

    it( 'accepts deprecated taskQueue body field, forwards as taskQueue, and warns', async () => {
      await request( `http://localhost:${PORT}` )
        .post( '/workflow/run' )
        .send( { workflowName: 'MyWorkflow', input: {}, taskQueue: 'sepcat' } )
        .expect( 200 );
      expect( mockClient.workflow.run ).toHaveBeenCalledWith( 'MyWorkflow', {}, expect.objectContaining( { taskQueue: 'sepcat' } ) );
      expect( mockLogger.warn ).toHaveBeenCalledWith(
        'Deprecated body field',
        expect.objectContaining( { field: 'taskQueue', successor: 'catalog', route: '/workflow/run' } )
      );
    } );

    it( 'prefers catalog over taskQueue when both are provided', async () => {
      await request( `http://localhost:${PORT}` )
        .post( '/workflow/run' )
        .send( { workflowName: 'MyWorkflow', input: {}, catalog: 'wins', taskQueue: 'loses' } )
        .expect( 200 );
      expect( mockClient.workflow.run ).toHaveBeenCalledWith( 'MyWorkflow', {}, expect.objectContaining( { taskQueue: 'wins' } ) );
    } );

    it( 'validation error returns 400', async () => {
      const res = await request( `http://localhost:${PORT}` ).post( '/workflow/run' ).send( { input: { x: 1 } } ).expect( 400 );
      expect( res.body ).toMatchObject( { error: 'ValidationError', message: 'Invalid Payload' } );
      expect( res.body.issues ).toBeDefined();
      expect( mockClient.workflow.run ).not.toHaveBeenCalled();
    } );

    it( 'rejects catalog containing characters that could break the visibility query', async () => {
      await request( `http://localhost:${PORT}` )
        .post( '/workflow/run' )
        .send( { workflowName: 'MyWorkflow', input: {}, catalog: 'sepcat" OR "x' } )
        .expect( 400 );
      expect( mockClient.workflow.run ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'POST /workflow/start', () => {
    it( 'returns workflowId and calls startWorkflow with input', async () => {
      const res = await request( `http://localhost:${PORT}` )
        .post( '/workflow/start' )
        .send( { workflowName: 'MyWorkflow', input: {} } )
        .expect( 200 );
      expect( res.body ).toEqual( { workflowId: 'start-1', runId: 'r-start' } );
      expect( mockClient.workflow.start ).toHaveBeenCalledWith( 'MyWorkflow', {}, expect.any( Object ) );
    } );

    it( 'forwards catalog body field as taskQueue to startWorkflow', async () => {
      await request( `http://localhost:${PORT}` )
        .post( '/workflow/start' )
        .send( { workflowName: 'MyWorkflow', input: {}, catalog: 'sepcat' } )
        .expect( 200 );
      expect( mockClient.workflow.start ).toHaveBeenCalledWith( 'MyWorkflow', {}, expect.objectContaining( { taskQueue: 'sepcat' } ) );
    } );

    it( 'accepts deprecated taskQueue body field, forwards as taskQueue, and warns', async () => {
      await request( `http://localhost:${PORT}` )
        .post( '/workflow/start' )
        .send( { workflowName: 'MyWorkflow', input: {}, taskQueue: 'sepcat' } )
        .expect( 200 );
      expect( mockClient.workflow.start ).toHaveBeenCalledWith( 'MyWorkflow', {}, expect.objectContaining( { taskQueue: 'sepcat' } ) );
      expect( mockLogger.warn ).toHaveBeenCalledWith(
        'Deprecated body field',
        expect.objectContaining( { field: 'taskQueue', successor: 'catalog', route: '/workflow/start' } )
      );
    } );

    it( 'validation error returns 400', async () => {
      await request( `http://localhost:${PORT}` ).post( '/workflow/start' ).send( {} ).expect( 400 );
      expect( mockClient.workflow.start ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'GET /workflow/:id/status (latest shortcut)', () => {
    it( 'returns workflow status for given id', async () => {
      const res = await request( `http://localhost:${PORT}` ).get( '/workflow/w1/status' ).expect( 200 );
      expect( res.body ).toMatchObject( { workflowId: 'w1', runId: 'r1', status: 'running' } );
      expect( mockClient.workflow.getStatus ).toHaveBeenCalledWith( 'w1', undefined );
    } );
  } );

  describe( 'GET /workflow/:id/runs/:rid/status (pinned)', () => {
    it( 'forwards the pinned runId to the client', async () => {
      await request( `http://localhost:${PORT}` ).get( `/workflow/w1/runs/${RID}/status` ).expect( 200 );
      expect( mockClient.workflow.getStatus ).toHaveBeenCalledWith( 'w1', RID );
    } );

    it( 'returns 400 when rid is not a valid UUID', async () => {
      const res = await request( `http://localhost:${PORT}` ).get( '/workflow/w1/runs/not-a-uuid/status' ).expect( 400 );
      expect( res.body ).toMatchObject( { error: 'ValidationError' } );
      expect( mockClient.workflow.getStatus ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'PATCH /workflow/:id/runs/:rid/stop (pinned)', () => {
    it( 'returns workflowId after stopping pinned run', async () => {
      const res = await request( `http://localhost:${PORT}` ).patch( `/workflow/w1/runs/${RID}/stop` ).expect( 200 );
      expect( res.body ).toEqual( { workflowId: 'w1', runId: 'r1' } );
      expect( mockClient.workflow.stop ).toHaveBeenCalledWith( 'w1', RID );
    } );

    it( 'returns 400 when rid is not a valid UUID', async () => {
      await request( `http://localhost:${PORT}` ).patch( '/workflow/w1/runs/not-a-uuid/stop' ).expect( 400 );
      expect( mockClient.workflow.stop ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'PATCH /workflow/:id/stop (deprecated shortcut)', () => {
    it( 'targets the latest run and sets deprecation headers', async () => {
      const res = await request( `http://localhost:${PORT}` ).patch( '/workflow/w1/stop' ).expect( 200 );
      expect( res.body ).toEqual( { workflowId: 'w1', runId: 'r1' } );
      expect( mockClient.workflow.stop ).toHaveBeenCalledWith( 'w1', undefined );
      expect( res.headers.deprecation ).toBe( 'true' );
      expect( res.headers.sunset ).toBe( new Date( '2026-07-16T00:00:00Z' ).toUTCString() );
      expect( res.headers.link ).toContain( '/workflow/{id}/runs/{rid}/stop' );
      expect( res.headers.link ).toContain( 'rel="successor-version"' );
      expect( mockLogger.warn ).toHaveBeenCalledWith(
        'Deprecated route hit',
        expect.objectContaining( { path: '/workflow/w1/stop', successor: '/workflow/{id}/runs/{rid}/stop' } )
      );
    } );
  } );

  describe( 'POST /workflow/:id/runs/:rid/terminate (pinned)', () => {
    it( 'returns terminated true with workflowId and runId', async () => {
      const res = await request( `http://localhost:${PORT}` )
        .post( `/workflow/w1/runs/${RID}/terminate` )
        .send( { reason: 'test reason' } )
        .expect( 200 );
      expect( res.body ).toEqual( { terminated: true, workflowId: 'w1', runId: 'r1' } );
      expect( mockClient.workflow.terminate ).toHaveBeenCalledWith( 'w1', 'test reason', RID );
    } );

    it( 'works without body', async () => {
      await request( `http://localhost:${PORT}` ).post( `/workflow/w1/runs/${RID}/terminate` ).expect( 200 );
      expect( mockClient.workflow.terminate ).toHaveBeenCalledWith( 'w1', undefined, RID );
    } );

    it( 'returns 400 when rid is not a valid UUID', async () => {
      await request( `http://localhost:${PORT}` ).post( '/workflow/w1/runs/not-a-uuid/terminate' ).expect( 400 );
      expect( mockClient.workflow.terminate ).not.toHaveBeenCalled();
    } );

    it( 'validation error when reason is not string returns 400', async () => {
      await request( `http://localhost:${PORT}` )
        .post( `/workflow/w1/runs/${RID}/terminate` )
        .send( { reason: 123 } )
        .expect( 400 );
      expect( mockClient.workflow.terminate ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'POST /workflow/:id/terminate (deprecated shortcut)', () => {
    it( 'targets the latest run and sets deprecation headers', async () => {
      const res = await request( `http://localhost:${PORT}` )
        .post( '/workflow/w1/terminate' )
        .send( { reason: 'test reason' } )
        .expect( 200 );
      expect( res.body ).toEqual( { terminated: true, workflowId: 'w1', runId: 'r1' } );
      expect( mockClient.workflow.terminate ).toHaveBeenCalledWith( 'w1', 'test reason', undefined );
      expect( res.headers.deprecation ).toBe( 'true' );
      expect( res.headers.sunset ).toBe( new Date( '2026-07-16T00:00:00Z' ).toUTCString() );
      expect( res.headers.link ).toContain( '/workflow/{id}/runs/{rid}/terminate' );
      expect( mockLogger.warn ).toHaveBeenCalledWith(
        'Deprecated route hit',
        expect.objectContaining( { path: '/workflow/w1/terminate' } )
      );
    } );
  } );

  describe( 'POST /workflow/:id/runs/:rid/reset (pinned)', () => {
    it( 'returns workflowId and runId when reset is successful', async () => {
      const res = await request( `http://localhost:${PORT}` )
        .post( `/workflow/w1/runs/${RID}/reset` )
        .send( { stepName: 'generateBlogPost', reason: 'retry with new prompt' } )
        .expect( 200 );
      expect( res.body ).toEqual( { workflowId: 'w1', runId: 'new-run-123' } );
      expect( mockClient.workflow.reset ).toHaveBeenCalledWith( 'w1', 'generateBlogPost', 'retry with new prompt', RID );
    } );

    it( 'works without reason', async () => {
      await request( `http://localhost:${PORT}` )
        .post( `/workflow/w1/runs/${RID}/reset` )
        .send( { stepName: 'generateBlogPost' } )
        .expect( 200 );
      expect( mockClient.workflow.reset ).toHaveBeenCalledWith( 'w1', 'generateBlogPost', undefined, RID );
    } );

    it( 'returns 400 when rid is not a valid UUID', async () => {
      await request( `http://localhost:${PORT}` )
        .post( '/workflow/w1/runs/not-a-uuid/reset' )
        .send( { stepName: 'generateBlogPost' } )
        .expect( 400 );
      expect( mockClient.workflow.reset ).not.toHaveBeenCalled();
    } );

    it( 'validation error when stepName is missing returns 400', async () => {
      await request( `http://localhost:${PORT}` )
        .post( `/workflow/w1/runs/${RID}/reset` )
        .send( { reason: 'no step' } )
        .expect( 400 );
      expect( mockClient.workflow.reset ).not.toHaveBeenCalled();
    } );

    it( 'validation error when stepName is not a string returns 400', async () => {
      await request( `http://localhost:${PORT}` )
        .post( `/workflow/w1/runs/${RID}/reset` )
        .send( { stepName: 123 } )
        .expect( 400 );
      expect( mockClient.workflow.reset ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'POST /workflow/:id/reset (deprecated shortcut)', () => {
    it( 'targets the latest run and sets deprecation headers', async () => {
      const res = await request( `http://localhost:${PORT}` )
        .post( '/workflow/w1/reset' )
        .send( { stepName: 'generateBlogPost' } )
        .expect( 200 );
      expect( mockClient.workflow.reset ).toHaveBeenCalledWith( 'w1', 'generateBlogPost', undefined, undefined );
      expect( res.headers.deprecation ).toBe( 'true' );
      expect( res.headers.sunset ).toBe( new Date( '2026-07-16T00:00:00Z' ).toUTCString() );
      expect( res.headers.link ).toContain( '/workflow/{id}/runs/{rid}/reset' );
      expect( mockLogger.warn ).toHaveBeenCalledWith(
        'Deprecated route hit',
        expect.objectContaining( { path: '/workflow/w1/reset' } )
      );
    } );
  } );

  describe( 'GET /workflow/:id/result (latest shortcut)', () => {
    it( 'returns workflow output and status when completed', async () => {
      const res = await request( `http://localhost:${PORT}` ).get( '/workflow/w1/result' ).expect( 200 );
      expect( res.body ).toMatchObject( { workflowId: 'w1', runId: 'r1', status: 'completed', output: { done: true } } );
      expect( mockClient.workflow.getResult ).toHaveBeenCalledWith( 'w1', undefined );
    } );
  } );

  describe( 'GET /workflow/:id/runs/:rid/result (pinned)', () => {
    it( 'forwards the pinned runId to the client', async () => {
      await request( `http://localhost:${PORT}` ).get( `/workflow/w1/runs/${RID}/result` ).expect( 200 );
      expect( mockClient.workflow.getResult ).toHaveBeenCalledWith( 'w1', RID );
    } );

    it( 'returns 400 when rid is not a valid UUID', async () => {
      await request( `http://localhost:${PORT}` ).get( '/workflow/w1/runs/not-a-uuid/result' ).expect( 400 );
      expect( mockClient.workflow.getResult ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'GET /workflow/:id/trace-log (latest shortcut)', () => {
    it( 'returns local trace path when trace is stored locally', async () => {
      const res = await request( `http://localhost:${PORT}` ).get( '/workflow/w1/trace-log' ).expect( 200 );
      expect( res.body ).toEqual( { source: 'local', runId: 'r1', localPath: '/tmp/trace.json' } );
      expect( mockClient.workflow.getResult ).toHaveBeenCalledWith( 'w1', undefined );
    } );
  } );

  describe( 'GET /workflow/:id/runs/:rid/trace-log (pinned)', () => {
    it( 'forwards the pinned runId to the client', async () => {
      await request( `http://localhost:${PORT}` ).get( `/workflow/w1/runs/${RID}/trace-log` ).expect( 200 );
      expect( mockClient.workflow.getResult ).toHaveBeenCalledWith( 'w1', RID );
    } );

    it( 'returns 400 when rid is not a valid UUID', async () => {
      await request( `http://localhost:${PORT}` ).get( '/workflow/w1/runs/not-a-uuid/trace-log' ).expect( 400 );
      expect( mockClient.workflow.getResult ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'GET /workflow/:id/history', () => {
    it( 'returns 200 with expected shape', async () => {
      const res = await request( `http://localhost:${PORT}` ).get( '/workflow/w1/history' ).expect( 200 );
      expect( res.body ).toMatchObject( {
        workflow: { workflowId: 'w1', status: 'running' },
        events: expect.any( Array ),
        nextPageToken: null
      } );
      expect( mockClient.workflow.getHistory ).toHaveBeenCalledWith( 'w1', {
        runId: undefined,
        pageSize: 20,
        pageToken: undefined,
        includePayloads: false
      } );
    } );

    it( 'returns 400 when pageToken is provided without runId', async () => {
      const token = Buffer.from( 'test' ).toString( 'base64' );
      await request( `http://localhost:${PORT}` )
        .get( `/workflow/w1/history?pageToken=${token}` )
        .expect( 400 );
    } );
  } );

  describe( 'GET /workflow/:id/runs/:rid/history', () => {
    it( 'passes pinned runId from path to client', async () => {
      await request( `http://localhost:${PORT}` ).get( `/workflow/w1/runs/${RID}/history` ).expect( 200 );
      expect( mockClient.workflow.getHistory ).toHaveBeenCalledWith( 'w1', expect.objectContaining( {
        runId: RID
      } ) );
    } );

    it( 'allows pageToken without query runId when runId is in path', async () => {
      const token = Buffer.from( 'test' ).toString( 'base64' );
      await request( `http://localhost:${PORT}` )
        .get( `/workflow/w1/runs/${RID}/history?pageToken=${token}` )
        .expect( 200 );
      expect( mockClient.workflow.getHistory ).toHaveBeenCalledWith( 'w1', expect.objectContaining( {
        runId: RID,
        pageToken: token
      } ) );
    } );
  } );

  describe( 'GET /workflow/catalog/:id', () => {
    it( 'returns workflows from catalog by id via queryWorkflow', async () => {
      const res = await request( `http://localhost:${PORT}` ).get( '/workflow/catalog/cat-1' ).expect( 200 );
      expect( res.body ).toEqual( { workflows: [] } );
      expect( mockClient.workflow.query ).toHaveBeenCalledWith( 'cat-1', 'get' );
    } );
  } );

  describe( 'GET /workflow/catalog', () => {
    it( 'returns default catalog workflows when no id in path', async () => {
      const res = await request( `http://localhost:${PORT}` ).get( '/workflow/catalog' ).expect( 200 );
      expect( res.body ).toEqual( { workflows: [] } );
      expect( mockClient.workflow.query ).toHaveBeenCalledWith( 'default-catalog', 'get' );
    } );
  } );

  describe( 'GET /workflow/runs', () => {
    it( 'returns list of workflow runs from listWorkflowRuns', async () => {
      const res = await request( `http://localhost:${PORT}` ).get( '/workflow/runs' ).expect( 200 );
      expect( res.body ).toEqual( { runs: [] } );
      expect( mockClient.workflow.listRuns ).toHaveBeenCalledWith( expect.any( Object ) );
    } );

    it( 'forwards catalog query param to listWorkflowRuns as taskQueue', async () => {
      await request( `http://localhost:${PORT}` ).get( '/workflow/runs?catalog=session-123' ).expect( 200 );
      expect( mockClient.workflow.listRuns ).toHaveBeenCalledWith( {
        workflowType: undefined,
        taskQueue: 'session-123',
        limit: 100
      } );
    } );

    it( 'forwards both workflowType and catalog (as taskQueue) together', async () => {
      await request( `http://localhost:${PORT}` ).get( '/workflow/runs?workflowType=simple&catalog=session-456' ).expect( 200 );
      expect( mockClient.workflow.listRuns ).toHaveBeenCalledWith( {
        workflowType: 'simple',
        taskQueue: 'session-456',
        limit: 100
      } );
    } );

    it( 'validation error when limit is out of range returns 400', async () => {
      const res = await request( `http://localhost:${PORT}` ).get( '/workflow/runs?limit=0' ).expect( 400 );
      expect( res.body ).toMatchObject( { error: 'ValidationError', message: 'Invalid Payload' } );
      expect( res.body.issues ).toBeDefined();
      expect( mockClient.workflow.listRuns ).not.toHaveBeenCalled();
    } );

    it( 'rejects catalog containing characters that could break the visibility query', async () => {
      await request( `http://localhost:${PORT}` )
        .get( '/workflow/runs?catalog=sepcat%22%20OR%20%22x' ) // sepcat" OR "x
        .expect( 400 );
      expect( mockClient.workflow.listRuns ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'POST /workflow/:id/feedback', () => {
    it( 'preserves payload properties', async () => {
      const payload = { score: 5, comment: 'Great work!', approved: true };
      await request( `http://localhost:${PORT}` ).post( '/workflow/w1/feedback' ).send( { payload } ).expect( 200 );
      expect( mockClient.workflow.signal ).toHaveBeenCalledWith( 'w1', 'resume', payload );
    } );

    it( 'accepts request with no payload and sends undefined to workflow', async () => {
      await request( `http://localhost:${PORT}` ).post( '/workflow/w1/feedback' ).expect( 200 );
      expect( mockClient.workflow.signal ).toHaveBeenCalledWith( 'w1', 'resume', undefined );
    } );

    it( 'validation error when payload is not object returns 400', async () => {
      await request( `http://localhost:${PORT}` ).post( '/workflow/w1/feedback' ).send( { payload: 'not-an-object' } ).expect( 400 );
      expect( mockClient.workflow.signal ).not.toHaveBeenCalled();
    } );
  } );

  describe( 'POST /workflow/:id/update/:update', () => {
    it( 'returns update result and calls executeUpdate with payload', async () => {
      mockClient.workflow.executeUpdate.mockResolvedValue( { result: { accepted: true } } );
      const res = await request( `http://localhost:${PORT}` )
        .post( '/workflow/w1/update/approve' )
        .send( { payload: { reason: 'ok' } } )
        .expect( 200 );
      expect( res.body ).toEqual( { result: { accepted: true } } );
      expect( mockClient.workflow.executeUpdate ).toHaveBeenCalledWith( 'w1', 'approve', { reason: 'ok' } );
    } );

    it( 'works with no payload', async () => {
      mockClient.workflow.executeUpdate.mockResolvedValue( { result: null } );
      await request( `http://localhost:${PORT}` ).post( '/workflow/w1/update/ping' ).expect( 200 );
      expect( mockClient.workflow.executeUpdate ).toHaveBeenCalledWith( 'w1', 'ping', undefined );
    } );
  } );

  describe( 'POST /workflow/:id/signal/:signal', () => {
    it( 'sends signal with payload and returns 200', async () => {
      await request( `http://localhost:${PORT}` )
        .post( '/workflow/w1/signal/cancel' )
        .send( { payload: { reason: 'done' } } )
        .expect( 200 );
      expect( mockClient.workflow.signal ).toHaveBeenCalledWith( 'w1', 'cancel', { reason: 'done' } );
    } );

    it( 'works with no payload', async () => {
      await request( `http://localhost:${PORT}` ).post( '/workflow/w1/signal/ping' ).expect( 200 );
      expect( mockClient.workflow.signal ).toHaveBeenCalledWith( 'w1', 'ping', undefined );
    } );
  } );

  describe( 'POST /workflow/:id/query/:query', () => {
    it( 'returns query result and calls sendQuery with payload', async () => {
      mockClient.workflow.query.mockResolvedValue( { data: { count: 42 } } );
      const res = await request( `http://localhost:${PORT}` )
        .post( '/workflow/w1/query/getState' )
        .send( { payload: { key: 'x' } } )
        .expect( 200 );
      expect( res.body ).toEqual( { data: { count: 42 } } );
      expect( mockClient.workflow.query ).toHaveBeenCalledWith( 'w1', 'getState', { key: 'x' } );
    } );

    it( 'works with no payload', async () => {
      mockClient.workflow.query.mockResolvedValue( { data: null } );
      await request( `http://localhost:${PORT}` ).post( '/workflow/w1/query/getState' ).expect( 200 );
      expect( mockClient.workflow.query ).toHaveBeenCalledWith( 'w1', 'getState', undefined );
    } );
  } );

  describe( 'unknown route', () => {
    it( 'returns 404', () => request( `http://localhost:${PORT}` ).get( '/unknown' ).expect( 404 ) );
  } );
} );
