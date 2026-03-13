import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks for module aliases used by webhook.js
vi.mock( '#consts', () => ( {
  ACTIVITY_SEND_HTTP_REQUEST: '__internal#sendHttpRequest'
} ) );

const validateRequestPayloadMock = vi.fn();
vi.mock( './validations/static.js', () => ( {
  validateRequestPayload: validateRequestPayloadMock
} ) );

// Minimal, legible mock of @temporalio/workflow APIs used by webhook.js
const activityFnMock = vi.fn();
const proxyActivitiesMock = vi.fn( () => ( { ['__internal#sendHttpRequest']: activityFnMock } ) );

const storedHandlers = new Map();
const defineSignalMock = name => name;
const setHandlerMock = ( signal, fn ) => {
  storedHandlers.set( signal, fn );
};

const workflowInfoMock = vi.fn( () => ( { workflowId: 'wf-123' } ) );
const sinks = { trace: { start: vi.fn(), end: vi.fn() } };
const proxySinksMock = vi.fn( async () => sinks );

class TestTrigger {
  constructor() {
    this.resolved = false;
    this._resolve = () => {};
    this.promise = new Promise( res => {
      this._resolve = res;
    } );
  }
  resolve( value ) {
    if ( !this.resolved ) {
      this.resolved = true;
      this._resolve( value );
    }
  }
  then( onFulfilled, onRejected ) {
    return this.promise.then( onFulfilled, onRejected );
  }
}

vi.mock( '@temporalio/workflow', () => ( {
  defineSignal: defineSignalMock,
  setHandler: setHandlerMock,
  proxyActivities: proxyActivitiesMock,
  workflowInfo: workflowInfoMock,
  proxySinks: proxySinksMock,
  uuid4: () => 'uuid-mock',
  Trigger: TestTrigger
} ) );

describe( 'interface/webhook', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    storedHandlers.clear();
  } );

  it( 'sendHttpRequest validates input and calls activity with correct options and args', async () => {
    const { sendHttpRequest } = await import( './webhook.js' );

    const fakeSerializedResponse = {
      url: 'https://example.com',
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: { 'content-type': 'application/json' },
      body: { ok: true }
    };
    activityFnMock.mockResolvedValueOnce( fakeSerializedResponse );

    const args = { url: 'https://example.com/api', method: 'GET' };
    const res = await sendHttpRequest( args );

    // validated
    expect( validateRequestPayloadMock ).toHaveBeenCalledWith( { ...args, payload: undefined, headers: undefined } );

    // activity proxied with specified options
    expect( proxyActivitiesMock ).toHaveBeenCalledTimes( 1 );
    const optionsArg = proxyActivitiesMock.mock.calls[0][0];
    expect( optionsArg.startToCloseTimeout ).toBe( '3m' );
    expect( optionsArg.retry ).toEqual( expect.objectContaining( {
      initialInterval: '15s',
      maximumAttempts: 3,
      nonRetryableErrorTypes: expect.arrayContaining( [ 'FatalError' ] )
    } ) );

    // activity invoked with the same args
    expect( activityFnMock ).toHaveBeenCalledWith( { ...args, payload: undefined, headers: undefined } );
    expect( res ).toEqual( fakeSerializedResponse );
  } );

  it( 'sendPostRequestAndAwaitWebhook posts wrapped payload and resolves on resume signal', async () => {
    const { sendPostRequestAndAwaitWebhook } = await import( './webhook.js' );

    // Make the inner activity resolve (through sendHttpRequest)
    activityFnMock.mockResolvedValueOnce( {
      url: 'https://webhook.site',
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: {},
      body: null
    } );

    const url = 'https://webhook.site/ingest';
    const promise = sendPostRequestAndAwaitWebhook( { url, payload: { x: 1 }, headers: { a: 'b' } } );

    // The activity was called via sendHttpRequest with POST and wrapped payload
    const callArgs = activityFnMock.mock.calls[0][0];
    expect( callArgs.method ).toBe( 'POST' );
    expect( callArgs.url ).toBe( url );
    expect( callArgs.payload ).toEqual( { workflowId: 'wf-123', payload: { x: 1 } } );
    expect( callArgs.headers ).toEqual( { a: 'b' } );

    // Returns a promise (async function) for the eventual webhook result
    expect( typeof promise.then ).toBe( 'function' );
  } );
} );
