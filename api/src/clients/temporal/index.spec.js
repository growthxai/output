import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockConnect,
  mockClientCtor,
  MockClient,
  mockConnection,
  mockTemporalWorkflow,
  mockLoggerInfo,
  mockGetWorkflowMethods,
  workflowMethods
} = vi.hoisted( () => {
  const mockConnection = {
    close: vi.fn(),
    workflowService: { service: true }
  };
  const mockTemporalWorkflow = {
    getHandle: vi.fn()
  };
  const workflowMethods = {
    getHistory: vi.fn(),
    getResult: vi.fn(),
    getStatus: vi.fn(),
    listRuns: vi.fn(),
    query: vi.fn(),
    reset: vi.fn(),
    run: vi.fn(),
    signal: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    terminate: vi.fn(),
    executeUpdate: vi.fn()
  };
  const mockClientCtor = vi.fn();

  class MockClient {
    constructor( options ) {
      mockClientCtor( options );
      return { workflow: mockTemporalWorkflow };
    }
  }

  return {
    mockConnect: vi.fn(),
    mockClientCtor,
    MockClient,
    mockConnection,
    mockTemporalWorkflow,
    mockLoggerInfo: vi.fn(),
    mockGetWorkflowMethods: vi.fn( () => workflowMethods ),
    workflowMethods
  };
} );

vi.mock( '@temporalio/client', () => ( {
  Client: MockClient,
  Connection: { connect: mockConnect }
} ) );

vi.mock( '#configs', () => ( {
  temporal: {
    address: 'localhost:7233',
    apiKey: 'test-api-key',
    namespace: 'test-namespace',
    grpcMaxMessageSizeBytes: 32 * 1024 * 1024
  }
} ) );

vi.mock( '#logger', () => ( {
  logger: { info: mockLoggerInfo }
} ) );

vi.mock( './workflow/index.js', () => ( {
  getWorkflowMethods: mockGetWorkflowMethods
} ) );

describe( 'temporal client', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mockConnection.close.mockResolvedValue( undefined );
    mockConnect.mockResolvedValue( mockConnection );
  } );

  it( 'connects to Temporal with configured namespace and gRPC message size limits', async () => {
    const temporalClient = ( await import( './index.js' ) ).default;

    await temporalClient.init();

    expect( mockLoggerInfo ).toHaveBeenCalledWith( 'Temporal client connecting', {
      address: 'localhost:7233',
      namespace: 'test-namespace',
      grpcMaxMessageSizeBytes: 32 * 1024 * 1024
    } );
    expect( mockConnect ).toHaveBeenCalledWith( {
      address: 'localhost:7233',
      tls: true,
      apiKey: 'test-api-key',
      channelArgs: {
        'grpc.max_receive_message_length': 32 * 1024 * 1024,
        'grpc.max_send_message_length': 32 * 1024 * 1024
      }
    } );
    expect( mockClientCtor ).toHaveBeenCalledWith( {
      connection: mockConnection,
      namespace: 'test-namespace'
    } );
    expect( mockLoggerInfo ).toHaveBeenCalledWith( 'Temporal client connected', {
      address: 'localhost:7233',
      namespace: 'test-namespace'
    } );
  } );

  it( 'builds workflow methods with the internal Temporal dependencies', async () => {
    const temporalClient = ( await import( './index.js' ) ).default;

    const client = await temporalClient.init();

    expect( mockGetWorkflowMethods ).toHaveBeenCalledWith( {
      client: { workflow: mockTemporalWorkflow },
      connection: mockConnection
    } );
    expect( client.workflow ).toBe( workflowMethods );
  } );

  it( 'closes the Temporal connection', async () => {
    const temporalClient = ( await import( './index.js' ) ).default;
    const client = await temporalClient.init();

    await client.close();

    expect( mockConnection.close ).toHaveBeenCalled();
  } );
} );
