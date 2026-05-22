import { describe, it, expect, vi, beforeEach } from 'vitest';

const storageLoadMock = vi.fn();
vi.mock( '#async_storage', () => ( {
  Storage: { load: storageLoadMock }
} ) );

const logWarnMock = vi.fn();
const logErrorMock = vi.fn();
vi.mock( '#logger', () => ( {
  createChildLogger: () => ( { warn: logWarnMock, error: logErrorMock } )
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

    const executionContext = { disableTrace: false };
    addEventAction( 'start', {
      kind: 'step', name: 'N', id: '1', parentId: 'p', details: { ok: true }, executionContext
    } );
    expect( localExecMock ).toHaveBeenCalledTimes( 1 );
    const payload = localExecMock.mock.calls[0][0];
    expect( payload.entry.name ).toBe( 'N' );
    expect( payload.entry.kind ).toBe( 'step' );
    expect( payload.entry.action ).toBe( 'start' );
    expect( payload.entry.details ).toEqual( { ok: true } );
    expect( payload.executionContext ).toBe( executionContext );
  } );

  it( 'addEventAction() emits an entry consumed by processors', async () => {
    process.env.OUTPUT_TRACE_LOCAL_ON = 'on';
    const { init, addEventAction } = await loadTraceEngine();
    await init();

    addEventAction( 'end', {
      kind: 'workflow', name: 'W', id: '2', parentId: 'p2', details: 'done',
      executionContext: { disableTrace: false }
    } );
    expect( localExecMock ).toHaveBeenCalledTimes( 1 );
    const payload = localExecMock.mock.calls[0][0];
    expect( payload.entry.name ).toBe( 'W' );
    expect( payload.entry.action ).toBe( 'end' );
    expect( payload.entry.details ).toBe( 'done' );
  } );

  it( 'addEventAction() does not emit when executionContext.disableTrace is true', async () => {
    process.env.OUTPUT_TRACE_LOCAL_ON = '1';
    const { init, addEventAction } = await loadTraceEngine();
    await init();

    addEventAction( 'start', {
      kind: 'step', name: 'X', id: '1', parentId: 'p', details: {},
      executionContext: { disableTrace: true }
    } );
    expect( localExecMock ).not.toHaveBeenCalled();
  } );

  it( 'addEventAction() does not emit when kind is INTERNAL_STEP', async () => {
    process.env.OUTPUT_TRACE_LOCAL_ON = '1';
    const { init, addEventAction } = await loadTraceEngine();
    await init();

    addEventAction( 'start', {
      kind: 'internal_step', name: 'Internal', id: '1', parentId: 'p', details: {},
      executionContext: { disableTrace: false }
    } );
    expect( localExecMock ).not.toHaveBeenCalled();
  } );

  it( 'addEventActionWithContext() uses storage when available', async () => {
    process.env.OUTPUT_TRACE_LOCAL_ON = 'true';
    storageLoadMock.mockReturnValue( {
      parentId: 'ctx-p',
      executionContext: { runId: 'r1', disableTrace: false }
    } );
    const { init, addEventActionWithContext } = await loadTraceEngine();
    await init();

    addEventActionWithContext( 'tick', { kind: 'step', name: 'S', id: '3', details: 1 } );
    expect( localExecMock ).toHaveBeenCalledTimes( 1 );
    const payload = localExecMock.mock.calls[0][0];
    expect( payload.executionContext ).toEqual( { runId: 'r1', disableTrace: false } );
    expect( payload.entry.parentId ).toBe( 'ctx-p' );
    expect( payload.entry.name ).toBe( 'S' );
    expect( payload.entry.action ).toBe( 'tick' );
  } );

  it( 'addEventActionWithContext() sends ADD_ATTR attributes through storage context', async () => {
    process.env.OUTPUT_TRACE_LOCAL_ON = 'true';
    const sendAttributeSignalMock = vi.fn();
    const executionContext = { runId: 'r1', disableTrace: false };
    storageLoadMock.mockReturnValue( {
      parentId: 'ctx-p',
      executionContext,
      sendAttributeSignal: sendAttributeSignalMock
    } );
    const { init, addEventActionWithContext } = await loadTraceEngine();
    const { EventAction } = await import( './trace_consts.js' );
    const { Attribute } = await import( './trace_attribute.js' );
    await init();

    const attribute = new Attribute.HTTPRequestCount( 'https://example.test', 'req-1' );
    addEventActionWithContext( EventAction.ADD_ATTR, { kind: 'http', name: 'request', id: 'req-1', details: attribute } );

    expect( sendAttributeSignalMock ).toHaveBeenCalledTimes( 1 );
    expect( sendAttributeSignalMock ).toHaveBeenCalledWith( attribute );
    expect( localExecMock ).toHaveBeenCalledTimes( 1 );
    expect( localExecMock.mock.calls[0][0] ).toEqual( {
      executionContext,
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
    const sendAttributeSignalMock = vi.fn();
    storageLoadMock.mockReturnValue( {
      parentId: 'ctx-p',
      executionContext: { runId: 'r1', disableTrace: false },
      sendAttributeSignal: sendAttributeSignalMock
    } );
    const { init, addEventActionWithContext } = await loadTraceEngine();
    const { EventAction } = await import( './trace_consts.js' );
    await init();

    const invalidAttribute = { type: 'not-a-base-attribute' };
    expect( () => addEventActionWithContext(
      EventAction.ADD_ATTR,
      { kind: 'http', name: 'request', id: 'req-1', details: invalidAttribute }
    ) ).toThrow( /not a BaseAttribute instance/ );

    expect( sendAttributeSignalMock ).not.toHaveBeenCalled();
    expect( localExecMock ).not.toHaveBeenCalled();
  } );

  it( 'addEventActionWithContext() does not emit when storage executionContext.disableTrace is true', async () => {
    process.env.OUTPUT_TRACE_LOCAL_ON = '1';
    storageLoadMock.mockReturnValue( {
      parentId: 'ctx-p',
      executionContext: { runId: 'r1', disableTrace: true }
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
    const executionContext = { workflowId: 'w1', workflowName: 'WF', startTime: 1, disableTrace: false };

    it( 'returns null for both when traces are off (env vars unset)', async () => {
      const { getDestinations } = await loadTraceEngine();
      const result = getDestinations( executionContext );
      expect( result ).toEqual( { local: null, remote: null } );
      expect( localGetDestinationMock ).not.toHaveBeenCalled();
      expect( s3GetDestinationMock ).not.toHaveBeenCalled();
    } );

    it( 'returns null for both when executionContext.disableTrace is true', async () => {
      process.env.OUTPUT_TRACE_LOCAL_ON = '1';
      process.env.OUTPUT_TRACE_REMOTE_ON = '1';
      const { getDestinations } = await loadTraceEngine();
      const result = getDestinations( { ...executionContext, disableTrace: true } );
      expect( result ).toEqual( { local: null, remote: null } );
      expect( localGetDestinationMock ).not.toHaveBeenCalled();
      expect( s3GetDestinationMock ).not.toHaveBeenCalled();
    } );

    it( 'returns both destinations when both traces are on', async () => {
      process.env.OUTPUT_TRACE_LOCAL_ON = '1';
      process.env.OUTPUT_TRACE_REMOTE_ON = 'true';
      const { getDestinations } = await loadTraceEngine();
      const result = getDestinations( executionContext );
      expect( result ).toEqual( {
        local: '/local/path.json',
        remote: 'https://bucket.s3.amazonaws.com/key.json'
      } );
      expect( localGetDestinationMock ).toHaveBeenCalledTimes( 1 );
      expect( localGetDestinationMock ).toHaveBeenCalledWith( executionContext );
      expect( s3GetDestinationMock ).toHaveBeenCalledTimes( 1 );
      expect( s3GetDestinationMock ).toHaveBeenCalledWith( executionContext );
    } );

    it( 'returns local only when local trace on and remote off', async () => {
      process.env.OUTPUT_TRACE_LOCAL_ON = '1';
      process.env.OUTPUT_TRACE_REMOTE_ON = '0';
      const { getDestinations } = await loadTraceEngine();
      const result = getDestinations( executionContext );
      expect( result ).toEqual( { local: '/local/path.json', remote: null } );
      expect( localGetDestinationMock ).toHaveBeenCalledWith( executionContext );
      expect( s3GetDestinationMock ).not.toHaveBeenCalled();
    } );

    it( 'returns remote only when local trace off and remote on', async () => {
      process.env.OUTPUT_TRACE_LOCAL_ON = '0';
      process.env.OUTPUT_TRACE_REMOTE_ON = 'true';
      const { getDestinations } = await loadTraceEngine();
      const result = getDestinations( executionContext );
      expect( result ).toEqual( { local: null, remote: 'https://bucket.s3.amazonaws.com/key.json' } );
      expect( localGetDestinationMock ).not.toHaveBeenCalled();
      expect( s3GetDestinationMock ).toHaveBeenCalledWith( executionContext );
    } );
  } );
} );
