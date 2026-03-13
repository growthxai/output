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

vi.mock( 'node:fs', () => ( {
  mkdirSync: mkdirSyncMock,
  writeFileSync: writeFileSyncMock,
  appendFileSync: appendFileSyncMock,
  readFileSync: readFileSyncMock,
  readdirSync: readdirSyncMock,
  rmSync: rmSyncMock
} ) );

const buildTraceTreeMock = vi.fn( entries => ( { count: entries.length } ) );
vi.mock( '../../tools/build_trace_tree.js', () => ( { default: buildTraceTreeMock } ) );

describe( 'tracing/processors/local', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    store.files.clear();
    process.argv[2] = '/tmp/project';
    delete process.env.OUTPUT_TRACE_HOST_PATH; // Clear OUTPUT_TRACE_HOST_PATH for clean tests
  } );

  it( 'init(): creates temp dir and cleans up old files', async () => {
    const { init } = await import( './index.js' );

    const now = Date.now();
    readdirSyncMock.mockReturnValue( [ `${now - ( 8 * 24 * 60 * 60 * 1000 )}_old.trace`, `${now}_new.trace` ] );

    init();

    // Should create temp dir relative to module location using __dirname
    expect( mkdirSyncMock ).toHaveBeenCalledWith( expect.stringMatching( /temp\/traces$/ ), { recursive: true } );
    expect( rmSyncMock ).toHaveBeenCalledTimes( 1 );
  } );

  it( 'exec(): accumulates entries and writes aggregated tree', async () => {
    const { exec, init } = await import( './index.js' );
    init();

    const startTime = Date.parse( '2020-01-02T03:04:05.678Z' );
    const ctx = { executionContext: { workflowId: 'id1', workflowName: 'WF', startTime } };

    exec( { ...ctx, entry: { name: 'A', phase: 'start', timestamp: startTime } } );
    exec( { ...ctx, entry: { name: 'A', phase: 'tick', timestamp: startTime + 1 } } );
    exec( { ...ctx, entry: { name: 'A', phase: 'end', timestamp: startTime + 2 } } );

    // buildTraceTree called with 1, 2, 3 entries respectively
    expect( buildTraceTreeMock ).toHaveBeenCalledTimes( 3 );
    expect( buildTraceTreeMock.mock.calls.at( -1 )[0].length ).toBe( 3 );

    expect( writeFileSyncMock ).toHaveBeenCalledTimes( 3 );
    const [ writtenPath, content ] = writeFileSyncMock.mock.calls.at( -1 );
    // Changed: Now uses process.cwd() + '/logs' fallback when OUTPUT_TRACE_HOST_PATH not set
    expect( writtenPath ).toMatch( /\/runs\/WF\// );
    expect( JSON.parse( content.trim() ).count ).toBe( 3 );
  } );

  it( 'getDestination(): returns absolute path', async () => {
    const { getDestination } = await import( './index.js' );

    const startTime = Date.parse( '2020-01-02T03:04:05.678Z' );
    const workflowId = 'workflow-id-123';
    const workflowName = 'test-workflow';

    const destination = getDestination( { startTime, workflowId, workflowName } );

    // Should return an absolute path
    expect( destination ).toMatch( /^\/|^[A-Z]:\\/i ); // Starting with / or Windows drive letter
    expect( destination ).toContain( '/logs/runs/test-workflow/2020-01-02-03-04-05-678Z_workflow-id-123.json' );
  } );

  it( 'exec(): writes to container path regardless of OUTPUT_TRACE_HOST_PATH', async () => {
    const { exec, init } = await import( './index.js' );

    // Set OUTPUT_TRACE_HOST_PATH to simulate Docker environment
    process.env.OUTPUT_TRACE_HOST_PATH = '/host/path/logs';

    init();

    const startTime = Date.parse( '2020-01-02T03:04:05.678Z' );
    const ctx = { executionContext: { workflowId: 'id1', workflowName: 'WF', startTime } };

    exec( { ...ctx, entry: { name: 'A', phase: 'start', timestamp: startTime } } );

    expect( writeFileSyncMock ).toHaveBeenCalledTimes( 1 );
    const [ writtenPath ] = writeFileSyncMock.mock.calls.at( -1 );

    // Should write to process.cwd()/logs, NOT to OUTPUT_TRACE_HOST_PATH
    expect( writtenPath ).not.toContain( '/host/path/logs' );
    expect( writtenPath ).toMatch( /logs\/runs\/WF\// );
  } );

  it( 'getDestination(): returns OUTPUT_TRACE_HOST_PATH when set', async () => {
    const { getDestination } = await import( './index.js' );

    // Set OUTPUT_TRACE_HOST_PATH to simulate Docker environment
    process.env.OUTPUT_TRACE_HOST_PATH = '/host/path/logs';

    const startTime = Date.parse( '2020-01-02T03:04:05.678Z' );
    const workflowId = 'workflow-id-123';
    const workflowName = 'test-workflow';

    const destination = getDestination( { startTime, workflowId, workflowName } );

    // Should return OUTPUT_TRACE_HOST_PATH-based path for reporting
    expect( destination ).toBe( '/host/path/logs/runs/test-workflow/2020-01-02-03-04-05-678Z_workflow-id-123.json' );
  } );

  it( 'separation of write and report paths works correctly', async () => {
    const { exec, getDestination, init } = await import( './index.js' );

    // Set OUTPUT_TRACE_HOST_PATH to simulate Docker environment
    process.env.OUTPUT_TRACE_HOST_PATH = '/Users/ben/project/logs';

    init();

    const startTime = Date.parse( '2020-01-02T03:04:05.678Z' );
    const workflowId = 'workflow-id-123';
    const workflowName = 'test-workflow';
    const ctx = { executionContext: { workflowId, workflowName, startTime } };

    // Execute to write file
    exec( { ...ctx, entry: { name: 'A', phase: 'start', timestamp: startTime } } );

    // Get destination for reporting
    const destination = getDestination( { startTime, workflowId, workflowName } );

    // Verify write path is local
    const [ writtenPath ] = writeFileSyncMock.mock.calls.at( -1 );
    expect( writtenPath ).not.toContain( '/Users/ben/project' );
    expect( writtenPath ).toMatch( /logs\/runs\/test-workflow\// );

    // Verify report path uses OUTPUT_TRACE_HOST_PATH
    expect( destination ).toBe( '/Users/ben/project/logs/runs/test-workflow/2020-01-02-03-04-05-678Z_workflow-id-123.json' );
  } );
} );

