import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock( '#utils', () => ( {
  throws: e => {
    throw e;
  }
} ) );

const logCalls = { warn: [], error: [] };
vi.mock( '#logger', () => ( {
  createChildLogger: () => ( {
    warn: ( ...args ) => logCalls.warn.push( args ),
    error: ( ...args ) => logCalls.error.push( args )
  } )
} ) );

const getVarsMock = vi.fn();
vi.mock( './configs.js', () => ( { getVars: () => getVarsMock() } ) );

const createClientImpl = vi.fn();
vi.mock( 'redis', () => ( { createClient: opts => createClientImpl( opts ) } ) );

async function loadModule() {
  vi.resetModules();
  return import( './redis_client.js' );
}

describe( 'tracing/processors/s3/redis_client', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    getVarsMock.mockReturnValue( {} );
    logCalls.warn = [];
    logCalls.error = [];
  } );

  afterEach( () => {
    vi.useRealTimers();
  } );

  it( 'throws when config redisUrl is missing', async () => {
    getVarsMock.mockReturnValue( {} );
    const { getRedisClient } = await loadModule();
    await expect( getRedisClient() ).rejects.toThrow();
  } );

  it( 'creates client with url, connects once, then reuses cached when ping is PONG', async () => {
    getVarsMock.mockReturnValue( { redisUrl: 'redis://localhost:6379' } );

    const pingMock = vi.fn().mockResolvedValue( 'PONG' );
    const connectMock = vi.fn().mockResolvedValue();
    const created = [];
    createClientImpl.mockImplementation( opts => {
      created.push( opts );
      return { connect: connectMock, ping: pingMock };
    } );

    const { getRedisClient } = await loadModule();

    const c1 = await getRedisClient();
    const c2 = await getRedisClient();

    expect( created ).toHaveLength( 1 );
    expect( connectMock ).toHaveBeenCalledTimes( 1 );
    expect( pingMock ).toHaveBeenCalledTimes( 1 );
    expect( c1 ).toBe( c2 );
    expect( created[0] ).toMatchObject( { url: 'redis://localhost:6379', socket: { keepAlive: 15000 } } );
  } );

  it( 'closes stale client and reconnects when ping fails', async () => {
    getVarsMock.mockReturnValue( { redisUrl: 'redis://localhost:6379' } );

    const quitMock = vi.fn().mockResolvedValue();
    const connectMock = vi.fn().mockResolvedValue();
    const pingMock = vi.fn()
      .mockResolvedValueOnce( 'PONG' )
      .mockRejectedValueOnce( new Error( 'Connection lost' ) )
      .mockResolvedValueOnce( 'PONG' );

    const created = [];
    createClientImpl.mockImplementation( opts => {
      created.push( opts );
      return { connect: connectMock, ping: pingMock, quit: quitMock };
    } );

    const { getRedisClient } = await loadModule();

    const c1 = await getRedisClient();
    const c2 = await getRedisClient();
    expect( c1 ).toBe( c2 );
    expect( created ).toHaveLength( 1 );

    const c3 = await getRedisClient();
    expect( quitMock ).toHaveBeenCalledTimes( 1 );
    expect( created ).toHaveLength( 2 );
    expect( c3 ).not.toBe( c1 );
  } );

  it( 'reconnects successfully even when quit() on stale client rejects', async () => {
    getVarsMock.mockReturnValue( { redisUrl: 'redis://localhost:6379' } );

    const quitMock = vi.fn().mockRejectedValue( new Error( 'Quit failed' ) );
    const connectMock = vi.fn().mockResolvedValue();
    const pingMock = vi.fn()
      .mockResolvedValueOnce( 'PONG' )
      .mockRejectedValueOnce( new Error( 'Connection lost' ) )
      .mockResolvedValueOnce( 'PONG' );

    const created = [];
    createClientImpl.mockImplementation( opts => {
      created.push( opts );
      return { connect: connectMock, ping: pingMock, quit: quitMock };
    } );

    const { getRedisClient } = await loadModule();

    const c1 = await getRedisClient();
    const c1again = await getRedisClient();
    expect( c1 ).toBe( c1again );
    expect( created ).toHaveLength( 1 );

    const c2 = await getRedisClient();
    expect( quitMock ).toHaveBeenCalledTimes( 1 );
    expect( created ).toHaveLength( 2 );
    expect( c2 ).not.toBe( c1 );
  } );

  it( 'wraps connect() errors with code and cleans up failed client', async () => {
    getVarsMock.mockReturnValue( { redisUrl: 'redis://localhost:6379' } );

    const connectErr = new Error( 'Connection refused' );
    connectErr.code = 'ECONNREFUSED';
    const connectMock = vi.fn().mockRejectedValue( connectErr );
    const quitMock = vi.fn().mockResolvedValue();

    createClientImpl.mockImplementation( () => ( {
      connect: connectMock,
      quit: quitMock
    } ) );

    const { getRedisClient } = await loadModule();

    try {
      await getRedisClient();
      expect.fail( 'Should have thrown' );
    } catch ( err ) {
      expect( err.message ).toBe( 'Failed to connect to Redis: Connection refused (ECONNREFUSED)' );
      expect( err.cause ).toBe( connectErr );
    }

    expect( quitMock ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'logs ping failures with error level', async () => {
    getVarsMock.mockReturnValue( { redisUrl: 'redis://localhost:6379' } );

    const pingErr = new Error( 'Connection reset' );
    pingErr.code = 'ECONNRESET';
    const pingMock = vi.fn()
      .mockResolvedValueOnce( 'PONG' )
      .mockRejectedValueOnce( pingErr )
      .mockResolvedValueOnce( 'PONG' );
    const connectMock = vi.fn().mockResolvedValue();
    const quitMock = vi.fn().mockResolvedValue();

    createClientImpl.mockImplementation( () => ( {
      connect: connectMock,
      ping: pingMock,
      quit: quitMock
    } ) );

    const { getRedisClient } = await loadModule();

    // First call: state.client is null, creates client (no ping)
    await getRedisClient();
    // Second call: pings existing client, returns PONG
    await getRedisClient();
    // Third call: pings existing client, fails with pingErr, reconnects
    await getRedisClient();

    expect( logCalls.error ).toContainEqual( [
      'Redis ping failed',
      { error: 'Connection reset', code: 'ECONNRESET' }
    ] );
  } );
} );
