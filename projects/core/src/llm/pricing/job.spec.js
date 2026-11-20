import { beforeEach, describe, expect, it, vi } from 'vitest';

const INTERVAL_AFTER_SUCCESS = 70;
const INTERVAL_AFTER_ERROR = 30;
const DATA_SOURCE_URL = 'https://models.dev/api.json';

const {
  EnvHttpProxyAgentMock,
  fetchMock,
  mockLog,
  sleepMock,
  updateCacheMock
} = vi.hoisted( () => ( {
  EnvHttpProxyAgentMock: vi.fn( function EnvHttpProxyAgent( options ) {
    this.options = options;
  } ),
  fetchMock: vi.fn(),
  mockLog: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  sleepMock: vi.fn(),
  updateCacheMock: vi.fn()
} ) );

vi.mock( 'undici', () => ( {
  EnvHttpProxyAgent: EnvHttpProxyAgentMock,
  fetch: fetchMock
} ) );
vi.mock( './cache.js', () => ( { update: updateCacheMock } ) );
vi.mock( '#helpers/promise', () => ( { sleepCancellable: sleepMock } ) );
vi.mock( '#runtime_logger', () => ( {
  Logger: { createLogger: () => mockLog }
} ) );

const { LLMPricingDataRetriever } = await import( './job.js' );

const pricedTable = {
  openai: {
    models: {
      'gpt-4o': { cost: { input: 2.5, output: 10 }, reasoning: false }
    }
  }
};

const okResponse = data => ( {
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue( data )
} );

const flushPromises = async () => Array
  .from( { length: 10 } )
  .reduce( promise => promise.then( () => Promise.resolve() ), Promise.resolve() );

const overrides = {
  intervalAfterSuccess: INTERVAL_AFTER_SUCCESS,
  intervalAfterError: INTERVAL_AFTER_ERROR
};

/** Runs one loop iteration then aborts during the sleep. */
const runUntilSleep = async ( signal, controller ) => {
  sleepMock.mockImplementationOnce( async () => {
    controller.abort();
  } );
  await new LLMPricingDataRetriever( { signal, overrides } ).start();
};

describe( 'LLMPricingDataRetriever', () => {
  beforeEach( () => {
    fetchMock.mockReset();
    sleepMock.mockReset();
    updateCacheMock.mockReset();
    mockLog.error.mockClear();
    mockLog.info.mockClear();
    mockLog.warn.mockClear();
    sleepMock.mockResolvedValue( undefined );
  } );

  it( 'disables http/2 on the undici proxy agent', () => {
    expect( EnvHttpProxyAgentMock ).toHaveBeenCalledWith( { allowH2: false } );
  } );

  it( 'fetches, caches, and waits the success interval', async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce( okResponse( pricedTable ) );

    await runUntilSleep( controller.signal, controller );

    expect( fetchMock ).toHaveBeenCalledWith( DATA_SOURCE_URL, {
      dispatcher: expect.any( EnvHttpProxyAgentMock ),
      signal: expect.any( AbortSignal )
    } );
    expect( updateCacheMock ).toHaveBeenCalledWith( new Map( [
      [ 'openai/gpt-4o', { cost: { input: 2.5, output: 10 }, reasoning: false } ]
    ] ) );
    expect( mockLog.info ).toHaveBeenCalledWith( 'Data acquired' );
    expect( sleepMock ).toHaveBeenCalledWith( INTERVAL_AFTER_SUCCESS, expect.any( AbortSignal ) );
  } );

  it( 'logs an http error and waits the error interval', async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce( { ok: false, status: 503 } );

    await runUntilSleep( controller.signal, controller );

    expect( updateCacheMock ).not.toHaveBeenCalled();
    expect( mockLog.error ).toHaveBeenCalledWith( 'Request error', { status: 503 } );
    expect( sleepMock ).toHaveBeenCalledWith( INTERVAL_AFTER_ERROR, expect.any( AbortSignal ) );
  } );

  it( 'logs a network failure and waits the error interval', async () => {
    const controller = new AbortController();
    const error = Object.assign( new Error( 'socket hang up' ), { code: 'ECONNRESET' } );
    fetchMock.mockRejectedValueOnce( error );

    await runUntilSleep( controller.signal, controller );

    expect( updateCacheMock ).not.toHaveBeenCalled();
    expect( mockLog.error ).toHaveBeenCalledWith( 'Request failure', {
      error: 'socket hang up',
      code: 'ECONNRESET'
    } );
    expect( sleepMock ).toHaveBeenCalledWith( INTERVAL_AFTER_ERROR, expect.any( AbortSignal ) );
  } );

  it( 'logs a parsing failure and waits the error interval', async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce( okResponse( { openai: { models: { bare: {} } } } ) );

    await runUntilSleep( controller.signal, controller );

    expect( updateCacheMock ).not.toHaveBeenCalled();
    expect( mockLog.error ).toHaveBeenCalledWith( 'Parsing failure', { error: 'Empty response' } );
    expect( sleepMock ).toHaveBeenCalledWith( INTERVAL_AFTER_ERROR, expect.any( AbortSignal ) );
  } );

  it( 'does not log when the fetch is aborted', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementationOnce( async () => {
      controller.abort();
      throw Object.assign( new Error( 'aborted' ), { name: 'AbortError' } );
    } );

    await new LLMPricingDataRetriever( { signal: controller.signal, overrides } ).start();

    expect( mockLog.error ).not.toHaveBeenCalled();
    expect( updateCacheMock ).not.toHaveBeenCalled();
  } );

  it( 'keeps looping until the signal aborts', async () => {
    const controller = new AbortController();
    fetchMock
      .mockResolvedValueOnce( okResponse( pricedTable ) )
      .mockResolvedValueOnce( { ok: false, status: 500 } );

    sleepMock
      .mockImplementationOnce( async () => undefined )
      .mockImplementationOnce( async () => {
        controller.abort();
      } );

    await new LLMPricingDataRetriever( { signal: controller.signal, overrides } ).start();
    await flushPromises();

    expect( fetchMock ).toHaveBeenCalledTimes( 2 );
    expect( updateCacheMock ).toHaveBeenCalledOnce();
    expect( sleepMock ).toHaveBeenNthCalledWith( 1, INTERVAL_AFTER_SUCCESS, expect.any( AbortSignal ) );
    expect( sleepMock ).toHaveBeenNthCalledWith( 2, INTERVAL_AFTER_ERROR, expect.any( AbortSignal ) );
  } );

  it( 'never fetches when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect( new LLMPricingDataRetriever( { signal: controller.signal, overrides } ).start() )
      .resolves.toBeUndefined();

    expect( fetchMock ).not.toHaveBeenCalled();
  } );
} );
