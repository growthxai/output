import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadMock = vi.fn();
vi.mock( '#async_storage', () => ( {
  Storage: { load: loadMock }
} ) );

const getHandleMock = vi.fn();
const clientConstructorMock = vi.fn( function () {
  this.workflow = { getHandle: getHandleMock };
} );
vi.mock( '@temporalio/client', () => ( {
  Client: clientConstructorMock
} ) );

const connection = {
  fake: 'native-connection',
  close: vi.fn().mockResolvedValue( undefined )
};
const activityContext = {
  activityInfo: {
    workflowExecution: {
      workflowId: 'workflow-1',
      runId: 'run-1'
    }
  }
};

describe( 'Temporal client', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.resetModules();
  } );

  describe( 'createTemporalClient', () => {
    it( 'throws a FatalError outside the worker runtime', async () => {
      const { createTemporalClient } = await import( './client.js' );
      const { FatalError } = await import( '#errors' );

      expect( () => createTemporalClient() ).toThrow( FatalError );
    } );

    it( 'creates a client with the worker connection and namespace', async () => {
      const { createTemporalClient, setupClientConfig } = await import( './client.js' );
      setupClientConfig( { connection, namespace: 'namespace-1' } );

      const client = createTemporalClient();

      expect( clientConstructorMock ).toHaveBeenCalledWith( {
        connection: expect.anything(),
        namespace: 'namespace-1'
      } );
      expect( clientConstructorMock.mock.calls[0][0].connection ).not.toBe( connection );
      expect( client ).toBeInstanceOf( clientConstructorMock );
    } );

    it( 'delegates connection access but prevents closing the worker connection', async () => {
      const { createTemporalClient, setupClientConfig } = await import( './client.js' );
      const { FatalError } = await import( '#errors' );
      setupClientConfig( { connection, namespace: 'namespace-1' } );

      createTemporalClient();
      const clientConnection = clientConstructorMock.mock.calls[0][0].connection;

      expect( clientConnection.fake ).toBe( 'native-connection' );
      await expect( clientConnection.close() ).rejects.toThrow( FatalError );
      expect( connection.close ).not.toHaveBeenCalled();
    } );

    it( 'returns a new client on each call', async () => {
      const { createTemporalClient, setupClientConfig } = await import( './client.js' );
      setupClientConfig( { connection, namespace: 'namespace-1' } );

      expect( createTemporalClient() ).not.toBe( createTemporalClient() );
      expect( clientConstructorMock ).toHaveBeenCalledTimes( 2 );
    } );
  } );

  describe( 'getCurrentWorkflowHandle', () => {
    it( 'throws a FatalError outside a Temporal activity context', async () => {
      loadMock.mockReturnValue( undefined );
      const { getCurrentWorkflowHandle, setupClientConfig } = await import( './client.js' );
      const { FatalError } = await import( '#errors' );
      setupClientConfig( { connection, namespace: 'namespace-1' } );

      expect( () => getCurrentWorkflowHandle() ).toThrow( FatalError );
    } );

    it( 'throws a FatalError outside the worker runtime', async () => {
      loadMock.mockReturnValue( activityContext );
      const { getCurrentWorkflowHandle } = await import( './client.js' );
      const { FatalError } = await import( '#errors' );

      expect( () => getCurrentWorkflowHandle() ).toThrow( FatalError );
    } );

    it( 'returns the handle for the current workflow execution', async () => {
      const handle = { signal: vi.fn() };
      loadMock.mockReturnValue( activityContext );
      getHandleMock.mockReturnValue( handle );
      const { getCurrentWorkflowHandle, setupClientConfig } = await import( './client.js' );
      setupClientConfig( { connection, namespace: 'namespace-1' } );

      expect( getCurrentWorkflowHandle() ).toBe( handle );
      expect( clientConstructorMock ).toHaveBeenCalledWith( {
        connection: expect.anything(),
        namespace: 'namespace-1'
      } );
      expect( getHandleMock ).toHaveBeenCalledWith( 'workflow-1', 'run-1' );
    } );

    it( 'reuses its client across calls', async () => {
      loadMock.mockReturnValue( activityContext );
      const { getCurrentWorkflowHandle, setupClientConfig } = await import( './client.js' );
      setupClientConfig( { connection, namespace: 'namespace-1' } );

      getCurrentWorkflowHandle();
      getCurrentWorkflowHandle();

      expect( clientConstructorMock ).toHaveBeenCalledTimes( 1 );
      expect( getHandleMock ).toHaveBeenCalledTimes( 2 );
    } );
  } );
} );
