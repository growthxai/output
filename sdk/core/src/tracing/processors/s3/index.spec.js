import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const loadEnvMock = vi.fn();
const getVarsMock = vi.fn( () => ( {
  remoteS3Bucket: 'bkt',
  redisIncompleteWorkflowsTTL: 3600
} ) );
vi.mock( './configs.js', () => ( { loadEnv: loadEnvMock, getVars: getVarsMock } ) );

const redisMulti = {
  zAdd: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn()
};
const zRangeMock = vi.fn();
const delMock = vi.fn().mockResolvedValue( undefined );
const getRedisClientMock = vi.fn( async () => ( {
  multi: () => redisMulti,
  zRange: zRangeMock,
  del: delMock
} ) );
vi.mock( './redis_client.js', () => ( { getRedisClient: getRedisClientMock } ) );

const uploadMock = vi.fn();
vi.mock( './s3_client.js', () => ( { upload: uploadMock } ) );

const buildTraceTreeMock = vi.fn( entries => ( { count: entries.length } ) );
vi.mock( '../../tools/build_trace_tree.js', () => ( { default: buildTraceTreeMock } ) );

vi.mock( 'json-stream-stringify', async () => {
  const { Readable } = await import( 'node:stream' );
  return {
    JsonStreamStringify: class extends Readable {
      constructor( body ) {
        super();
        this.body = body;
      }

      _read() {
        this.push( JSON.stringify( this.body ) );
        this.push( null );
      }
    }
  };
} );

const streamToString = async stream => {
  const chunks = [];
  for await ( const chunk of stream ) {
    chunks.push( Buffer.isBuffer( chunk ) ? chunk : Buffer.from( chunk ) );
  }
  return Buffer.concat( chunks ).toString( 'utf8' );
};

describe( 'tracing/processors/s3', () => {
  const startTime = Date.parse( '2020-01-02T03:04:05.678Z' );
  const traceInfo = {
    workflowId: 'id1',
    runId: 'run-1',
    workflowType: 'WF',
    startTime
  };

  beforeEach( () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getVarsMock.mockReturnValue( { remoteS3Bucket: 'bkt', redisIncompleteWorkflowsTTL: 3600, traceUploadDelayMs: 10_000 } );
  } );

  afterEach( () => {
    vi.useRealTimers();
  } );

  it( 'init(): loads config and ensures redis client is created', async () => {
    const { init } = await import( './index.js' );
    await init();
    expect( loadEnvMock ).toHaveBeenCalledTimes( 1 );
    expect( getRedisClientMock ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'exec(): accumulates via redis, uploads only on root workflow end', async () => {
    const { exec } = await import( './index.js' );

    redisMulti.exec.mockResolvedValue( [] );

    const workflowStart = { id: 'run-1', name: 'WF', kind: 'workflow', action: 'start', details: {}, timestamp: startTime };
    const activityStart = {
      id: 'act-1',
      name: 'DoSomething',
      kind: 'step',
      parentId: 'run-1',
      action: 'start',
      details: {},
      timestamp: startTime + 1
    };
    const workflowEnd = { id: 'run-1', action: 'end', details: { ok: true }, timestamp: startTime + 2 };
    zRangeMock.mockResolvedValue( [
      JSON.stringify( workflowStart ),
      JSON.stringify( activityStart ),
      JSON.stringify( workflowEnd )
    ] );

    await exec( { traceInfo, entry: workflowStart } );
    await exec( { traceInfo, entry: activityStart } );
    // Root end: id matches runId and not start — triggers the 10s delay before upload
    const endPromise = exec( { traceInfo, entry: workflowEnd } );
    await vi.advanceTimersByTimeAsync( 10_000 );
    await endPromise;

    expect( redisMulti.zAdd ).toHaveBeenCalledTimes( 3 );
    expect( buildTraceTreeMock ).toHaveBeenCalledTimes( 1 );
    expect( zRangeMock ).toHaveBeenCalledTimes( 1 );
    expect( uploadMock ).toHaveBeenCalledTimes( 1 );
    const { key, content } = uploadMock.mock.calls[0][0];
    expect( key ).toMatch( /^WF\/2020\/01\/02\// );
    expect( JSON.parse( await streamToString( content ) ).count ).toBe( 3 );
    expect( delMock ).toHaveBeenCalledTimes( 1 );
    expect( delMock ).toHaveBeenCalledWith( 'traces/run-1' );
  } );

  it( 'getDestination(): returns S3 URL using bucket and key from getVars', async () => {
    getVarsMock.mockReturnValue( { remoteS3Bucket: 'my-bucket', redisIncompleteWorkflowsTTL: 3600, traceUploadDelayMs: 10_000 } );
    const { getDestination } = await import( './index.js' );
    const url = getDestination( traceInfo );
    expect( getVarsMock ).toHaveBeenCalled();
    expect( url ).toBe(
      'https://my-bucket.s3.amazonaws.com/WF/2020/01/02/2020-01-02-03-04-05-678Z_id1.json'
    );
  } );

  it( 'exec(): sets expiry on the redis key for each entry', async () => {
    const { exec } = await import( './index.js' );

    redisMulti.exec.mockResolvedValue( [] );
    const workflowStart = {
      kind: 'workflow', id: 'run-1', name: 'WF', parentId: undefined, action: 'start', details: {}, timestamp: startTime
    };
    zRangeMock.mockResolvedValue( [ JSON.stringify( workflowStart ) ] );

    await exec( { traceInfo, entry: workflowStart } );

    expect( redisMulti.expire ).toHaveBeenCalledTimes( 1 );
    expect( redisMulti.expire ).toHaveBeenCalledWith( 'traces/run-1', 3600 );
  } );

  it( 'exec(): does not treat a non-root end (e.g. step without parentId) as root workflow end — regression for wrong root detection', async () => {
    const { exec } = await import( './index.js' );

    redisMulti.exec.mockResolvedValue( [] );
    const workflowStart = { id: 'run-1', name: 'WF', kind: 'workflow', action: 'start', details: {}, timestamp: startTime };
    const stepEndNoParent = { id: 'step-1', action: 'end', details: { done: true }, timestamp: startTime + 1 };
    zRangeMock.mockResolvedValue( [
      JSON.stringify( workflowStart ),
      JSON.stringify( stepEndNoParent )
    ] );

    await exec( { traceInfo, entry: workflowStart } );
    await exec( { traceInfo, entry: stepEndNoParent } );

    expect( redisMulti.zAdd ).toHaveBeenCalledTimes( 2 );
    expect( buildTraceTreeMock ).not.toHaveBeenCalled();
    expect( uploadMock ).not.toHaveBeenCalled();
    expect( delMock ).not.toHaveBeenCalled();
  } );

  it( 'exec(): when buildTraceTree returns null (incomplete tree), does not upload or bust cache', async () => {
    const { exec } = await import( './index.js' );

    redisMulti.exec.mockResolvedValue( [] );
    const workflowEnd = {
      kind: 'workflow', id: 'run-1', name: 'WF', parentId: undefined, action: 'end', details: {}, timestamp: startTime
    };
    zRangeMock.mockResolvedValue( [ JSON.stringify( workflowEnd ) ] );
    buildTraceTreeMock.mockReturnValueOnce( null );

    const endPromise = exec( { traceInfo, entry: workflowEnd } );
    await vi.advanceTimersByTimeAsync( 10_000 );
    await endPromise;

    expect( buildTraceTreeMock ).toHaveBeenCalledTimes( 1 );
    expect( uploadMock ).not.toHaveBeenCalled();
    expect( delMock ).not.toHaveBeenCalled();
  } );
} );

