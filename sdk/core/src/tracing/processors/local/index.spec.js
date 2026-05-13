import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory fs mock store
const store = { files: new Map() };
const mkdirSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const appendFileSyncMock = vi.fn( ( path, data ) => {
  const prev = store.files.get( path ) ?? '';
  store.files.set( path, prev + data );
} );
const readFileSyncMock = vi.fn( path => store.files.get( path ) ?? '' );
const readdirSyncMock = vi.fn( () => [] );
const rmSyncMock = vi.fn();
const createWriteStreamMock = vi.fn( path => ( { path } ) );

vi.mock( 'node:fs', () => ( {
  mkdirSync: mkdirSyncMock,
  writeFileSync: writeFileSyncMock,
  appendFileSync: appendFileSyncMock,
  readFileSync: readFileSyncMock,
  readdirSync: readdirSyncMock,
  rmSync: rmSyncMock,
  createWriteStream: createWriteStreamMock
} ) );

const pipelineMock = vi.fn( async ( source, destination ) => {
  const chunks = [];
  for await ( const chunk of source ) {
    chunks.push( Buffer.isBuffer( chunk ) ? chunk : Buffer.from( chunk ) );
  }
  store.files.set( destination.path, Buffer.concat( chunks ).toString( 'utf8' ) );
} );
vi.mock( 'node:stream/promises', () => ( { pipeline: pipelineMock } ) );

vi.mock( 'big-json', async () => {
  const { Readable } = await import( 'node:stream' );
  return { createStringifyStream: ( { body } ) => Readable.from( [ JSON.stringify( body ) ] ) };
} );

const buildTraceTreeMock = vi.fn( entries => ( { count: entries.length } ) );
vi.mock( '../../tools/build_trace_tree.js', () => ( { default: buildTraceTreeMock } ) );

/** Flush happens when the root id matches workflowId and action is not 'start', or when action is 'error'. */
const rootStart = ( workflowId, ts ) => ( { id: workflowId, action: 'start', timestamp: ts } );
const rootEnd = ( workflowId, ts ) => ( { id: workflowId, action: 'end', timestamp: ts } );
const childTick = ( id, ts ) => ( { id, action: 'tick', timestamp: ts } );

describe( 'tracing/processors/local', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    store.files.clear();
    process.argv[2] = '/tmp/project';
    delete process.env.OUTPUT_TRACE_HOST_PATH;
  } );

  it( 'init(): creates temp dir and cleans up old files', async () => {
    const { init } = await import( './index.js' );

    const now = Date.now();
    readdirSyncMock.mockReturnValue( [ `${now - ( 8 * 24 * 60 * 60 * 1000 )}_old.trace`, `${now}_new.trace` ] );

    init();

    expect( mkdirSyncMock ).toHaveBeenCalledWith( expect.stringMatching( /temp\/traces$/ ), { recursive: true } );
    expect( rmSyncMock ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'exec(): appends each entry and writes aggregated tree once on root workflow end', async () => {
    const { exec, init } = await import( './index.js' );
    init();

    const startTime = Date.parse( '2020-01-02T03:04:05.678Z' );
    const workflowId = 'id1';
    const ctx = { executionContext: { workflowId, workflowName: 'WF', startTime } };

    await exec( { ...ctx, entry: rootStart( workflowId, startTime ) } );
    await exec( { ...ctx, entry: childTick( 'child-1', startTime + 1 ) } );
    await exec( { ...ctx, entry: rootEnd( workflowId, startTime + 2 ) } );

    expect( buildTraceTreeMock ).toHaveBeenCalledTimes( 1 );
    expect( buildTraceTreeMock.mock.calls[0][0] ).toHaveLength( 3 );

    expect( createWriteStreamMock ).toHaveBeenCalledTimes( 1 );
    expect( pipelineMock ).toHaveBeenCalledTimes( 1 );
    const [ writtenPath ] = createWriteStreamMock.mock.calls[0];
    expect( writtenPath ).toMatch( /\/tmp\/project\/logs\/runs\/WF\// );
    expect( JSON.parse( store.files.get( writtenPath ) ).count ).toBe( 3 );
  } );

  it( 'exec(): does not build or write on non-flush entries', async () => {
    const { exec, init } = await import( './index.js' );
    init();

    const startTime = Date.parse( '2020-01-02T03:04:05.678Z' );
    const workflowId = 'id1';
    const ctx = { executionContext: { workflowId, workflowName: 'WF', startTime } };

    await exec( { ...ctx, entry: rootStart( workflowId, startTime ) } );
    await exec( { ...ctx, entry: childTick( 'child-1', startTime + 1 ) } );

    expect( buildTraceTreeMock ).not.toHaveBeenCalled();
    expect( writeFileSyncMock ).not.toHaveBeenCalled();
    expect( createWriteStreamMock ).not.toHaveBeenCalled();
    expect( pipelineMock ).not.toHaveBeenCalled();
  } );

  it( 'exec(): flushes on error action before root end', async () => {
    const { exec, init } = await import( './index.js' );
    init();

    const startTime = Date.parse( '2020-01-02T03:04:05.678Z' );
    const workflowId = 'id1';
    const ctx = { executionContext: { workflowId, workflowName: 'WF', startTime } };

    await exec( { ...ctx, entry: rootStart( workflowId, startTime ) } );
    await exec( { ...ctx, entry: { id: 'step-1', action: 'error', timestamp: startTime + 1 } } );

    expect( buildTraceTreeMock ).toHaveBeenCalledTimes( 1 );
    expect( buildTraceTreeMock.mock.calls[0][0] ).toHaveLength( 2 );
    expect( createWriteStreamMock ).toHaveBeenCalledTimes( 1 );
    expect( pipelineMock ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'getDestination(): returns absolute path under callerDir logs', async () => {
    const { getDestination } = await import( './index.js' );

    const startTime = Date.parse( '2020-01-02T03:04:05.678Z' );
    const workflowId = 'workflow-id-123';
    const workflowName = 'test-workflow';

    const destination = getDestination( { startTime, workflowId, workflowName } );

    expect( destination ).toMatch( /^\/|^[A-Z]:\\/i );
    expect( destination ).toBe(
      '/tmp/project/logs/runs/test-workflow/2020-01-02-03-04-05-678Z_workflow-id-123.json'
    );
  } );

  it( 'exec(): writes under process.argv[2] logs even when OUTPUT_TRACE_HOST_PATH is set', async () => {
    const { exec, init } = await import( './index.js' );

    process.env.OUTPUT_TRACE_HOST_PATH = '/host/path/logs';

    init();

    const startTime = Date.parse( '2020-01-02T03:04:05.678Z' );
    const workflowId = 'id1';
    const ctx = { executionContext: { workflowId, workflowName: 'WF', startTime } };

    await exec( { ...ctx, entry: rootStart( workflowId, startTime ) } );
    await exec( { ...ctx, entry: rootEnd( workflowId, startTime + 1 ) } );

    expect( createWriteStreamMock ).toHaveBeenCalledTimes( 1 );
    const [ writtenPath ] = createWriteStreamMock.mock.calls[0];

    expect( writtenPath ).not.toContain( '/host/path/logs' );
    expect( writtenPath ).toMatch( /\/tmp\/project\/logs\/runs\/WF\// );
  } );

  it( 'getDestination(): returns OUTPUT_TRACE_HOST_PATH when set', async () => {
    const { getDestination } = await import( './index.js' );

    process.env.OUTPUT_TRACE_HOST_PATH = '/host/path/logs';

    const startTime = Date.parse( '2020-01-02T03:04:05.678Z' );
    const workflowId = 'workflow-id-123';
    const workflowName = 'test-workflow';

    const destination = getDestination( { startTime, workflowId, workflowName } );

    expect( destination ).toBe( '/host/path/logs/runs/test-workflow/2020-01-02-03-04-05-678Z_workflow-id-123.json' );
  } );

  it( 'separation of write and report paths works correctly', async () => {
    const { exec, getDestination, init } = await import( './index.js' );

    process.env.OUTPUT_TRACE_HOST_PATH = '/Users/ben/project/logs';

    init();

    const startTime = Date.parse( '2020-01-02T03:04:05.678Z' );
    const workflowId = 'workflow-id-123';
    const workflowName = 'test-workflow';
    const ctx = { executionContext: { workflowId, workflowName, startTime } };

    await exec( { ...ctx, entry: rootStart( workflowId, startTime ) } );
    await exec( { ...ctx, entry: rootEnd( workflowId, startTime + 1 ) } );

    const destination = getDestination( { startTime, workflowId, workflowName } );

    const [ writtenPath ] = createWriteStreamMock.mock.calls[0];
    expect( writtenPath ).not.toContain( '/Users/ben/project' );
    expect( writtenPath ).toMatch( /\/tmp\/project\/logs\/runs\/test-workflow\// );
    expect( JSON.parse( store.files.get( writtenPath ) ).count ).toBe( 2 );

    expect( destination ).toBe( '/Users/ben/project/logs/runs/test-workflow/2020-01-02-03-04-05-678Z_workflow-id-123.json' );
  } );
} );
