import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockConnect,
  mockClientCtor,
  MockClient,
  mockConnection,
  mockTemporalWorkflow,
  mockLoggerInfo,
  mockLoggerWarn,
  mockGetWorkflowMethods,
  MockConnectionMonitor,
  mockConnectionMonitorCtor,
  mockMonitor,
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
  const mockMonitor = {
    onConnectionLost: vi.fn(),
    onHeartbeat: vi.fn(),
    onRecover: vi.fn(),
    onUnhealthy: vi.fn(),
    start: vi.fn(),
    failing: false
  };
  const mockConnectionMonitorCtor = vi.fn();

  class MockClient {
    constructor( options ) {
      mockClientCtor( options );
      return { workflow: mockTemporalWorkflow };
    }
  }

  class MockConnectionMonitor {
    constructor( connection ) {
      mockConnectionMonitorCtor( connection );
      return mockMonitor;
    }
  }

  return {
    mockConnect: vi.fn(),
    mockClientCtor,
    MockClient,
    mockConnection,
    mockTemporalWorkflow,
    mockLoggerInfo: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockGetWorkflowMethods: vi.fn( () => workflowMethods ),
    MockConnectionMonitor,
    mockConnectionMonitorCtor,
    mockMonitor,
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
  logger: { info: mockLoggerInfo, warn: mockLoggerWarn }
} ) );

vi.mock( './workflow/index.js', () => ( {
  getWorkflowMethods: mockGetWorkflowMethods
} ) );

vi.mock( './connection_monitor.js', () => ( {
  ConnectionMonitor: MockConnectionMonitor
} ) );

describe( 'temporal client', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    mockMonitor.failing = false;
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
      },
      connectTimeout: 15_000
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

  it( 'starts a connection monitor and exposes readiness', async () => {
    const temporalClient = ( await import( './index.js' ) ).default;

    const client = await temporalClient.init();

    expect( mockConnectionMonitorCtor ).toHaveBeenCalledWith( mockConnection );
    expect( mockMonitor.onHeartbeat ).toHaveBeenCalledWith( expect.any( Function ) );
    expect( mockMonitor.onRecover ).toHaveBeenCalledWith( expect.any( Function ) );
    expect( mockMonitor.onUnhealthy ).toHaveBeenCalledWith( expect.any( Function ) );
    expect( mockMonitor.start ).toHaveBeenCalled();
    expect( client.isReady() ).toBe( true );

    mockMonitor.failing = true;

    expect( client.isReady() ).toBe( false );
  } );

  it( 'registers a connection lost callback after initialization', async () => {
    const onConnectionLost = vi.fn();
    const temporalClient = ( await import( './index.js' ) ).default;

    const client = await temporalClient.init();
    client.onConnectionLost( onConnectionLost );

    expect( mockMonitor.onConnectionLost ).toHaveBeenCalledWith( onConnectionLost );
  } );

  it( 'closes the Temporal connection', async () => {
    const temporalClient = ( await import( './index.js' ) ).default;
    const client = await temporalClient.init();

    await client.close();

    expect( mockConnection.close ).toHaveBeenCalled();
  } );
} );
