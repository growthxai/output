import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'undici';

vi.mock( '#tracing', async () => {
  const { EventAction } = await import( '../tracing/trace_consts.js' );
  return { EventAction, addEventActionWithContext: vi.fn() };
} );
vi.mock( '#bus', () => ( { stepEventBus: { emit: vi.fn() } } ) );
vi.mock( '#runtime_logger', () => ( { Logger: { warn: vi.fn() } } ) );

import { addEventActionWithContext, EventAction } from '#tracing';
import { stepEventBus } from '#bus';
import { Logger } from '#runtime_logger';
import { HTTPRequestCost, addRequestCost } from './cost.js';
import { addRequestIdToResponse, requestIdSymbol } from './request_tag.js';

const send = vi.mocked( addEventActionWithContext );
const bus = vi.mocked( stepEventBus, true );

const expectCostRecorded = ( requestId, total ) => {
  expect( send ).toHaveBeenCalledWith( EventAction.ADD_ATTR, { id: requestId, details: expect.any( HTTPRequestCost ) } );
  const attribute = send.mock.calls[0][1].details;
  expect( attribute ).toMatchObject( { type: 'http:request:cost', requestId, total } );
  expect( bus.emit ).toHaveBeenCalledWith( 'sdk:cost:http:request', attribute );
};

describe( 'addRequestCost', () => {
  beforeEach( () => {
    send.mockClear();
    bus.emit.mockClear();
    vi.mocked( Logger.warn ).mockClear();
  } );

  it( 'shortcircuits when the response has no http request id', () => {
    addRequestCost( new Response(), 1 );

    expect( Logger.warn ).toHaveBeenCalledTimes( 1 );
    expect( send ).not.toHaveBeenCalled();
    expect( bus.emit ).not.toHaveBeenCalled();
  } );

  it( 'records cost on the trace event when the response carries the request id', () => {
    const response = new Response( undefined, { status: 200 } );
    Reflect.set( response, requestIdSymbol, 'evt-cost-1' );

    addRequestCost( response, 2.5 );

    expectCostRecorded( 'evt-cost-1', 2.5 );
  } );

  it( 'records zero cost on the trace event', () => {
    const response = new Response();
    Reflect.set( response, requestIdSymbol, 'evt-cost-2' );

    addRequestCost( response, 0 );

    expectCostRecorded( 'evt-cost-2', 0 );
  } );

  // ky clones the response before passing it to afterResponse hooks, so the request id must survive clone().
  it( 'records cost on a cloned response (regression: ky afterResponse hooks)', () => {
    const response = new Response( undefined, { status: 200 } );
    addRequestIdToResponse( response, 'evt-clone-1' );

    addRequestCost( response.clone(), 4.2 );

    expectCostRecorded( 'evt-clone-1', 4.2 );
  } );
} );
