import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Response } from 'undici';
import { requestIdSymbol } from './consts.js';

vi.mock( '@outputai/core/sdk_activity_integration', () => {
  class HTTPRequestCost {
    static TYPE = 'http:request:cost';
    type = HTTPRequestCost.TYPE;
    url: string;
    requestId: string;
    total: number;

    constructor( url: string, requestId: string, total: number ) {
      this.url = url;
      this.requestId = requestId;
      this.total = total;
    }
  }

  return {
    Tracing: {
      addEventAttribute: vi.fn(),
      Attribute: {
        HTTPRequestCost
      }
    },
    emitEvent: vi.fn()
  };
} );

const mockLogger = vi.hoisted( () => ( {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn()
} ) );

vi.mock( '@outputai/core/logger', () => ( {
  createLogger: () => mockLogger
} ) );

import { Tracing, emitEvent } from '@outputai/core/sdk_activity_integration';
import { addRequestCost } from './cost.js';
import { addRequestIdToResponse } from './fetch/utils.js';

const tracing = vi.mocked( Tracing, true );
const emit = vi.mocked( emitEvent, true );

describe( 'addRequestCost', () => {
  beforeEach( () => {
    tracing.addEventAttribute.mockClear();
    emit.mockClear();
    mockLogger.warn.mockClear();
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  it( 'shortcircuits when the response has no http request id', () => {
    const response = new Response();
    const cost = 1;

    addRequestCost( response, cost );

    expect( mockLogger.warn ).toHaveBeenCalledWith(
      'addRequestCost(): The "response" argument did not originate from @outputai/http, no costs were added.'
    );
    expect( tracing.addEventAttribute ).not.toHaveBeenCalled();
    expect( emit ).not.toHaveBeenCalled();
  } );

  it( 'records cost on the trace event when the response carries the request id', () => {
    const response = new Response( undefined, { status: 200 } );
    Reflect.set( response, requestIdSymbol, 'evt-cost-1' );
    const cost = 2.5;

    addRequestCost( response, cost );

    expect( mockLogger.warn ).not.toHaveBeenCalled();
    expect( tracing.addEventAttribute ).toHaveBeenCalledWith( {
      eventId: 'evt-cost-1',
      attribute: expect.objectContaining( {
        type: Tracing.Attribute.HTTPRequestCost.TYPE,
        url: response.url,
        requestId: 'evt-cost-1',
        total: cost
      } )
    } );
    const attribute = tracing.addEventAttribute.mock.calls[0][0].attribute;
    expect( emit ).toHaveBeenCalledWith( 'cost:http:request', attribute );
  } );

  it( 'records zero cost on the trace event', () => {
    const response = new Response();
    Reflect.set( response, requestIdSymbol, 'evt-cost-2' );
    const cost = 0;

    addRequestCost( response, cost );

    expect( tracing.addEventAttribute ).toHaveBeenCalledWith( {
      eventId: 'evt-cost-2',
      attribute: expect.objectContaining( {
        type: Tracing.Attribute.HTTPRequestCost.TYPE,
        url: response.url,
        requestId: 'evt-cost-2',
        total: cost
      } )
    } );
    const attribute = tracing.addEventAttribute.mock.calls[0][0].attribute;
    expect( emit ).toHaveBeenCalledWith( 'cost:http:request', attribute );
  } );

  // ky clones the response before passing it to afterResponse hooks. Without
  // the clone-propagation patch in addRequestIdToResponse, this path silently
  // dropped cost (warned "did not originate from @outputai/http") for every
  // service client that emits cost from inside a ky hook.
  it( 'records cost on a cloned response (regression: ky afterResponse hooks)', () => {
    const response = new Response( undefined, { status: 200 } );
    addRequestIdToResponse( response, 'evt-clone-1' );

    const cloned = response.clone();
    addRequestCost( cloned, 4.2 );

    expect( mockLogger.warn ).not.toHaveBeenCalled();
    expect( tracing.addEventAttribute ).toHaveBeenCalledWith( {
      eventId: 'evt-clone-1',
      attribute: expect.objectContaining( {
        type: Tracing.Attribute.HTTPRequestCost.TYPE,
        requestId: 'evt-clone-1',
        total: 4.2
      } )
    } );
    const attribute = tracing.addEventAttribute.mock.calls[0][0].attribute;
    expect( emit ).toHaveBeenCalledWith( 'cost:http:request', attribute );
  } );
} );
