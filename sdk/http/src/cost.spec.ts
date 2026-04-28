import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestIdSymbol } from './consts.js';

vi.mock( '@outputai/core/sdk_activity_integration', () => ( {
  Tracing: {
    addEventAttribute: vi.fn(),
    Attribute: {
      COST: 'cost'
    }
  }
} ) );

import { Tracing } from '@outputai/core/sdk_activity_integration';
import { addRequestCost } from './cost.js';

const tracing = vi.mocked( Tracing, true );

describe( 'addRequestCost', () => {
  beforeEach( () => {
    tracing.addEventAttribute.mockClear();
    vi.spyOn( console, 'warn' ).mockImplementation( () => {} );
  } );

  afterEach( () => {
    vi.restoreAllMocks();
  } );

  it( 'shortcircuits when the response has no http request id', () => {
    const response = new Response();
    const cost = { total: 1 };

    addRequestCost( response, cost );

    expect( console.warn ).toHaveBeenCalledWith(
      'addRequestCost(): The "response" argument did not originate from @outputai/http, no costs were added.'
    );
    expect( tracing.addEventAttribute ).not.toHaveBeenCalled();
  } );

  it( 'records cost on the trace event when the response carries the request id', () => {
    const response = new Response();
    Reflect.set( response, requestIdSymbol, 'evt-cost-1' );
    const cost = { total: 2.5 };

    addRequestCost( response, cost );

    expect( console.warn ).not.toHaveBeenCalled();
    expect( tracing.addEventAttribute ).toHaveBeenCalledWith( {
      eventId: 'evt-cost-1',
      name: Tracing.Attribute.COST,
      value: cost
    } );
  } );

  it( 'forwards multiple components to tracing', () => {
    const response = new Response();
    Reflect.set( response, requestIdSymbol, 'evt-cost-2' );
    const cost = {
      total: 10,
      components: [
        { name: 'input', value: 3 },
        { name: 'output', value: 7 }
      ]
    };

    addRequestCost( response, cost );

    expect( tracing.addEventAttribute ).toHaveBeenCalledWith( {
      eventId: 'evt-cost-2',
      name: Tracing.Attribute.COST,
      value: cost
    } );
  } );

  it( 'forwards an empty components array to tracing', () => {
    const response = new Response();
    Reflect.set( response, requestIdSymbol, 'evt-cost-3' );
    const cost = { total: 1, components: [] };

    addRequestCost( response, cost );

    expect( tracing.addEventAttribute ).toHaveBeenCalledWith( {
      eventId: 'evt-cost-3',
      name: Tracing.Attribute.COST,
      value: cost
    } );
  } );
} );
