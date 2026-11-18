import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const closeMock = vi.fn().mockResolvedValue( undefined );
const connectionMock = { close: closeMock };

const queryMock = vi.fn();
const getHandleMock = vi.fn().mockReturnValue( { query: queryMock } );
const ClientMock = vi.fn().mockImplementation( function () {
  return { workflow: { getHandle: getHandleMock } };
} );
const connectMock = vi.fn().mockResolvedValue( connectionMock );

vi.mock( '@temporalio/client', () => ( {
  Connection: { connect: connectMock },
  Client: ClientMock
} ) );

describe( 'bin/healthcheck', () => {
  const exitMock = vi.fn();
  const originalExit = process.exit;

  beforeEach( () => {
    vi.clearAllMocks();
    process.exit = exitMock;
    process.env.TEMPORAL_ADDRESS = 'localhost:7233';
    process.env.TEMPORAL_NAMESPACE = 'default';
    process.env.OUTPUT_CATALOG_ID = 'test-catalog';
    delete process.env.TEMPORAL_API_KEY;
  } );

  afterEach( () => {
    process.exit = originalExit;
  } );

  it( 'exits 0 when catalog ping returns "pong"', async () => {
    queryMock.mockResolvedValue( 'pong' );
    vi.resetModules();
    await import( './healthcheck.mjs' );
    expect( connectMock ).toHaveBeenCalledWith( {
      address: 'localhost:7233',
      tls: false,
      apiKey: undefined
    } );
    expect( ClientMock ).toHaveBeenCalledWith( { connection: connectionMock, namespace: 'default' } );
    expect( getHandleMock ).toHaveBeenCalledWith( 'test-catalog' );
    expect( queryMock ).toHaveBeenCalledWith( 'ping' );
    expect( exitMock ).toHaveBeenCalledWith( 0 );
    expect( closeMock ).toHaveBeenCalled();
  } );

  it( 'uses TLS and apiKey when TEMPORAL_API_KEY is set', async () => {
    process.env.TEMPORAL_API_KEY = 'secret';
    queryMock.mockResolvedValue( 'pong' );
    vi.resetModules();
    await import( './healthcheck.mjs' );
    expect( connectMock ).toHaveBeenCalledWith( {
      address: 'localhost:7233',
      tls: true,
      apiKey: 'secret'
    } );
    expect( exitMock ).toHaveBeenCalledWith( 0 );
  } );

  it( 'uses default namespace and catalog id when env unset', async () => {
    delete process.env.TEMPORAL_NAMESPACE;
    delete process.env.OUTPUT_CATALOG_ID;
    queryMock.mockResolvedValue( 'pong' );
    vi.resetModules();
    await import( './healthcheck.mjs' );
    expect( ClientMock ).toHaveBeenCalledWith( { connection: connectionMock, namespace: 'default' } );
    expect( getHandleMock ).toHaveBeenCalledWith( 'main' );
    expect( exitMock ).toHaveBeenCalledWith( 0 );
  } );

  it( 'exits 1 when catalog ping returns non-pong', async () => {
    queryMock.mockResolvedValue( 'nope' );
    vi.resetModules();
    await import( './healthcheck.mjs' );
    expect( exitMock ).toHaveBeenCalledWith( 1 );
    expect( closeMock ).toHaveBeenCalled();
  } );

  it( 'exits 1 when query throws', async () => {
    queryMock.mockRejectedValue( new Error( 'connection refused' ) );
    vi.resetModules();
    await import( './healthcheck.mjs' );
    expect( exitMock ).toHaveBeenCalledWith( 1 );
    expect( closeMock ).toHaveBeenCalled();
  } );
} );
