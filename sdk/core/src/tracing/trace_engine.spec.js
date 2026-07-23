import { describe, it, expect, vi, beforeEach } from 'vitest';

const storageLoadMock = vi.fn();
vi.mock( '#async_storage', () => ( {
  Storage: { load: storageLoadMock }
} ) );

const serializeErrorMock = vi.fn( error => ( {
  name: error.name,
  message: error.message
} ) );
vi.mock( '#helpers/errors', () => ( { serializeError: serializeErrorMock } ) );

const logErrorMock = vi.fn();
vi.mock( '#logger', () => ( {
  createChildLogger: () => ( { error: logErrorMock } )
} ) );

const localInitMock = vi.fn( async () => {} );
const localExecMock = vi.fn();
const localGetDestinationMock = vi.fn( () => '/local/path.json' );
vi.mock( './processors/local/index.js', () => ( {
  init: localInitMock,
  exec: localExecMock,
  getDestination: localGetDestinationMock
} ) );

const s3InitMock = vi.fn( async () => {} );
const s3ExecMock = vi.fn();
const s3GetDestinationMock = vi.fn( () => 'https://bucket.s3.amazonaws.com/key.json' );
vi.mock( './processors/s3/index.js', () => ( {
  init: s3InitMock,
  exec: s3ExecMock,
  getDestination: s3GetDestinationMock
} ) );

async function loadTraceEngine() {
  vi.resetModules();
  return import( './trace_engine.js' );
}

const traceInfo = {
  workflowId: 'w1',
  runId: 'r1',
  workflowType: 'WF',
  startTime: 1
};

describe( 'tracing/trace_engine', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    delete process.env.OUTPUT_TRACE_LOCAL_ON;
    delete process.env.OUTPUT_TRACE_REMOTE_ON;
    storageLoadMock.mockReset();
  } );

  it( 'init() starts only enabled processors and attaches listeners', async () => {
    process.env.OUTPUT_TRACE_LOCAL_ON = '1';
    process.env.OUTPUT_TRACE_REMOTE_ON = '0';
    const { init, addEventAction } = await loadTraceEngine();

    await init();

    expect( localInitMock ).toHaveBeenCalledTimes( 1 );
    expect( s3InitMock ).not.toHaveBeenCalled();

    addEventAction( 'start', {
      kind: 'step', name: 'N', id: '1', parentId: 'p', details: { ok: true }, traceInfo
    } );
    expect( localExecMock ).toHaveBeenCalledTimes( 1 );
    const payload = localExecMock.mock.calls[0][0];
    expect( payload.entry.name ).toBe( 'N' );
    expect( payload.entry.kind ).toBe( 'step' );
    expect( payload.entry.action ).toBe( 'start' );
    expect( payload.entry.details ).toEqual( { ok: true } );
    expect( payload.traceInfo ).toBe( traceInfo );
  } );

  it( 'init() logs processor failures with serialized stacks', async () => {
    process.env.OUTPUT_TRACE_LOCAL_ON = '1';
    const processorError = new Error( 'processor failed' );
    localExecMock.mockRejectedValueOnce( processorError );
    const { init, addEventAction } = await loadTraceEngine();
    await init();

    addEventAction( 'start', {
      kind: 'step', name: 'N', id: '1', parentId: 'p', details: null, traceInfo
    } );

    await vi.waitFor( () => expect( logErrorMock ).toHaveBeenCalledWith( 'Processor execution error', {
      processor: 'LOCAL',
      error: { name: 'Error', message: 'processor failed' }
    } ) );
    expect( serializeErrorMock ).toHaveBeenCalledWith( processorError );
  } );

  it( 'addEventAction() emits an entry consumed by processors', async () => {
    process.env.OUTPUT_TRACE_LOCAL_ON = 'on';
    const { init, addEventAction } = await loadTraceEngine();
    await init();

    addEventAction( 'end', {
      kind: 'workflow', name: 'W', id: '2', parentId: 'p2', details: 'done',
      traceInfo
    } );
    expect( localExecMock ).toHaveBeenCalledTimes( 1 );
    const payload = localExecMock.mock.calls[0][0];
    expect( payload.entry.name ).toBe( 'W' );
    expect( payload.entry.action ).toBe( 'end' );
    expect( payload.entry.details ).toBe( 'done' );
  } );

  it( 'addEventAction() serializes error details before emitting', async () => {
    process.env.OUTPUT_TRACE_LOCAL_ON = 'on';
    const { init, addEventAction } = await loadTraceEngine();
    await init();
    const error = new TypeError( 'step failed' );

    addEventAction( 'error', {
      kind: 'step', name: 'S', id: '3', parentId: 'p3', details: error,
      traceInfo
    } );

    expect( serializeErrorMock ).toHaveBeenCalledWith( error );
    expect( localExecMock.mock.calls[0][0].entry.details ).toEqual( {
      name: 'TypeError',
      message: 'step failed'
    } );
  } );

  it( 'addEventAction() does not emit when traceInfo is absent', async () => {
    process.env.OUTPUT_TRACE_LOCAL_ON = '1';
    const { init, addEventAction } = await loadTraceEngine();
    await init();

    addEventAction( 'start', {
      kind: 'step', name: 'X', id: '1', parentId: 'p', details: {},
      traceInfo: undefined
    } );
    expect( localExecMock ).not.toHaveBeenCalled();
  } );

  it( 'addEventActionWithContext() uses storage when available', async () => {
    process.env.OUTPUT_TRACE_LOCAL_ON = 'true';
    storageLoadMock.mockReturnValue( {
      parentId: 'ctx-p',
      traceInfo
    } );
    const { init, addEventActionWithContext } = await loadTraceEngine();
    await init();

    addEventActionWithContext( 'tick', { kind: 'step', name: 'S', id: '3', details: 1 } );
    expect( localExecMock ).toHaveBeenCalledTimes( 1 );
    const payload = localExecMock.mock.calls[0][0];
    expect( payload.traceInfo ).toBe( traceInfo );
    expect( payload.entry.parentId ).toBe( 'ctx-p' );
    expect( payload.entry.name ).toBe( 'S' );
    expect( payload.entry.action ).toBe( 'tick' );
  } );

  it( 'addEventActionWithContext() emits validated ADD_ATTR trace entries', async () => {
    process.env.OUTPUT_TRACE_LOCAL_ON = 'true';
    storageLoadMock.mockReturnValue( {
      parentId: 'ctx-p',
      traceInfo
    } );
    const { init, addEventActionWithContext } = await loadTraceEngine();
    const { EventAction } = await import( './trace_consts.js' );
    const { Attribute } = await import( './trace_attribute.js' );
    await init();

    const attribute = new Attribute.HTTPRequestCount( 'https://example.test', 'req-1' );
    addEventActionWithContext( EventAction.ADD_ATTR, { kind: 'http', name: 'request', id: 'req-1', details: attribute } );

    expect( localExecMock ).toHaveBeenCalledTimes( 1 );
    expect( localExecMock.mock.calls[0][0] ).toEqual( {
      traceInfo,
      entry: {
        kind: 'http',
        action: EventAction.ADD_ATTR,
        name: 'request',
        id: 'req-1',
        parentId: 'ctx-p',
        timestamp: expect.any( Number ),
        details: attribute
      }
    } );
  } );

  it( 'addEventActionWithContext() throws on invalid ADD_ATTR signal payloads', async () => {
    process.env.OUTPUT_TRACE_LOCAL_ON = 'true';
    storageLoadMock.mockReturnValue( {
      parentId: 'ctx-p',
      traceInfo
    } );
    const { init, addEventActionWithContext } = await loadTraceEngine();
    const { EventAction } = await import( './trace_consts.js' );
    await init();

    const invalidAttribute = { type: 'not-a-base-attribute' };
    expect( () => addEventActionWithContext(
      EventAction.ADD_ATTR,
      { kind: 'http', name: 'request', id: 'req-1', details: invalidAttribute }
    ) ).toThrow( /not a BaseAttribute instance/ );

    expect( localExecMock ).not.toHaveBeenCalled();
  } );

  it( 'addEventActionWithContext() does not emit when storage traceInfo is absent', async () => {
    process.env.OUTPUT_TRACE_LOCAL_ON = '1';
    storageLoadMock.mockReturnValue( {
      parentId: 'ctx-p',
      traceInfo: undefined
    } );
    const { init, addEventActionWithContext } = await loadTraceEngine();
    await init();

    addEventActionWithContext( 'tick', { kind: 'step', name: 'S', id: '3', details: 1 } );
    expect( localExecMock ).not.toHaveBeenCalled();
  } );

  it( 'addEventActionWithContext() is a no-op when storage is absent', async () => {
    process.env.OUTPUT_TRACE_LOCAL_ON = '1';
    storageLoadMock.mockReturnValue( undefined );
    const { init, addEventActionWithContext } = await loadTraceEngine();
    await init();

    addEventActionWithContext( 'noop', { kind: 'step', name: 'X', id: '4', details: null } );
    expect( localExecMock ).not.toHaveBeenCalled();
  } );

  describe( 'getDestinations()', () => {
    it( 'returns an empty object when traces are off (env vars unset)', async () => {
      const { getDestinations } = await loadTraceEngine();
      const result = getDestinations( traceInfo );
      expect( result ).toEqual( {} );
      expect( localGetDestinationMock ).not.toHaveBeenCalled();
      expect( s3GetDestinationMock ).not.toHaveBeenCalled();
    } );

    it( 'returns both destinations when both traces are on', async () => {
      process.env.OUTPUT_TRACE_LOCAL_ON = '1';
      process.env.OUTPUT_TRACE_REMOTE_ON = 'true';
      const { getDestinations } = await loadTraceEngine();
      const result = getDestinations( traceInfo );
      expect( result ).toEqual( {
        local: '/local/path.json',
        remote: 'https://bucket.s3.amazonaws.com/key.json'
      } );
      expect( localGetDestinationMock ).toHaveBeenCalledTimes( 1 );
      expect( localGetDestinationMock ).toHaveBeenCalledWith( traceInfo );
      expect( s3GetDestinationMock ).toHaveBeenCalledTimes( 1 );
      expect( s3GetDestinationMock ).toHaveBeenCalledWith( traceInfo );
    } );

    it( 'returns local only when local trace on and remote off', async () => {
      process.env.OUTPUT_TRACE_LOCAL_ON = '1';
      process.env.OUTPUT_TRACE_REMOTE_ON = '0';
      const { getDestinations } = await loadTraceEngine();
      const result = getDestinations( traceInfo );
      expect( result ).toEqual( { local: '/local/path.json' } );
      expect( localGetDestinationMock ).toHaveBeenCalledWith( traceInfo );
      expect( s3GetDestinationMock ).not.toHaveBeenCalled();
    } );

    it( 'returns remote only when local trace off and remote on', async () => {
      process.env.OUTPUT_TRACE_LOCAL_ON = '0';
      process.env.OUTPUT_TRACE_REMOTE_ON = 'true';
      const { getDestinations } = await loadTraceEngine();
      const result = getDestinations( traceInfo );
      expect( result ).toEqual( { remote: 'https://bucket.s3.amazonaws.com/key.json' } );
      expect( localGetDestinationMock ).not.toHaveBeenCalled();
      expect( s3GetDestinationMock ).toHaveBeenCalledWith( traceInfo );
    } );
  } );
} );
