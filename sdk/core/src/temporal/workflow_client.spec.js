import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadMock = vi.fn();
vi.mock( '#async_storage', () => ( {
  Storage: { load: loadMock }
} ) );

const signalMock = vi.fn();
const getHandleMock = vi.fn( () => ( { signal: signalMock } ) );
const clientConstructorMock = vi.fn( function () {
  this.workflow = { getHandle: getHandleMock };
} );
vi.mock( '@temporalio/client', () => ( {
  Client: clientConstructorMock
} ) );

const activityContext = {
  activityInfo: {
    activityId: 'activity-1',
    activityType: 'myWorkflow#myStep',
    workflowExecution: { workflowId: 'wf-1', runId: 'run-1' },
    workflowType: 'myWorkflow'
  },
  workflowFilename: '/workflows/myWorkflow.js'
};

const connection = { fake: 'native-connection' };

describe( 'workflow_client', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.resetModules();
  } );

  describe( 'getWorkflowClient', () => {
    it( 'throws a FatalError when no worker connection is registered', async () => {
      const { getWorkflowClient } = await import( './workflow_client.js' );
      const { FatalError } = await import( '#errors' );
      expect( () => getWorkflowClient() ).toThrow( FatalError );
    } );

    it( 'builds a Client from the registered worker connection and namespace', async () => {
      const { getWorkflowClient, registerWorkflowClientConnection } = await import( './workflow_client.js' );
      registerWorkflowClientConnection( { connection, namespace: 'my-namespace' } );
      const client = getWorkflowClient();
      expect( clientConstructorMock ).toHaveBeenCalledWith( { connection, namespace: 'my-namespace' } );
      expect( client ).toBeInstanceOf( clientConstructorMock );
    } );

    it( 'memoizes the Client across calls', async () => {
      const { getWorkflowClient, registerWorkflowClientConnection } = await import( './workflow_client.js' );
      registerWorkflowClientConnection( { connection, namespace: 'ns' } );
      expect( getWorkflowClient() ).toBe( getWorkflowClient() );
      expect( clientConstructorMock ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'rebuilds the Client after re-registration', async () => {
      const { getWorkflowClient, registerWorkflowClientConnection } = await import( './workflow_client.js' );
      registerWorkflowClientConnection( { connection, namespace: 'ns-1' } );
      getWorkflowClient();
      registerWorkflowClientConnection( { connection, namespace: 'ns-2' } );
      getWorkflowClient();
      expect( clientConstructorMock ).toHaveBeenCalledTimes( 2 );
      expect( clientConstructorMock ).toHaveBeenLastCalledWith( { connection, namespace: 'ns-2' } );
    } );

    it( 'throws again after the connection is cleared on shutdown', async () => {
      const { getWorkflowClient, registerWorkflowClientConnection, clearWorkflowClientConnection } =
        await import( './workflow_client.js' );
      const { FatalError } = await import( '#errors' );
      registerWorkflowClientConnection( { connection, namespace: 'ns' } );
      getWorkflowClient();
      clearWorkflowClientConnection();
      expect( () => getWorkflowClient() ).toThrow( FatalError );
    } );
  } );

  describe( 'signalInvokingWorkflow', () => {
    it( 'throws a FatalError outside of an activity context', async () => {
      loadMock.mockReturnValue( undefined );
      const { signalInvokingWorkflow, registerWorkflowClientConnection } = await import( './workflow_client.js' );
      const { FatalError } = await import( '#errors' );
      registerWorkflowClientConnection( { connection, namespace: 'ns' } );
      await expect( signalInvokingWorkflow( 'newToken', 'abc' ) ).rejects.toThrow( FatalError );
    } );

    it( 'signals the invoking workflow pinned to its workflowId and runId', async () => {
      loadMock.mockReturnValue( activityContext );
      const { signalInvokingWorkflow, registerWorkflowClientConnection } = await import( './workflow_client.js' );
      registerWorkflowClientConnection( { connection, namespace: 'ns' } );
      await signalInvokingWorkflow( 'newToken', 'batch-1', 7 );
      expect( getHandleMock ).toHaveBeenCalledWith( 'wf-1', 'run-1' );
      expect( signalMock ).toHaveBeenCalledWith( 'newToken', 'batch-1', 7 );
    } );

    it( 'propagates signal failures (e.g. workflow already completed)', async () => {
      loadMock.mockReturnValue( activityContext );
      signalMock.mockRejectedValueOnce( new Error( 'workflow execution already completed' ) );
      const { signalInvokingWorkflow, registerWorkflowClientConnection } = await import( './workflow_client.js' );
      registerWorkflowClientConnection( { connection, namespace: 'ns' } );
      await expect( signalInvokingWorkflow( 'markDone' ) ).rejects.toThrow( 'workflow execution already completed' );
    } );
  } );
} );
