import { describe, expect, it } from 'vitest';
import { parseRequestDetails } from './request_details.js';
import { LLMRequestDetails } from './models/llm_generation.js';

describe( 'parseRequestDetails', () => {
  it( 'returns the request ids, the request count and the duration', () => {
    const result = parseRequestDetails( {
      requestsHeaders: [ { 'request-id': 'req-1' }, { 'x-request-id': 'req-2' } ],
      duration: 120
    } );

    expect( result ).toBeInstanceOf( LLMRequestDetails );
    expect( result ).toEqual( { ids: [ 'req-1', 'req-2' ], count: 2, duration: 120 } );
  } );

  it( 'prefers request-id over x-request-id', () => {
    const result = parseRequestDetails( { requestsHeaders: [ { 'request-id': 'req-1', 'x-request-id': 'req-x' } ], duration: 1 } );

    expect( result.ids ).toEqual( [ 'req-1' ] );
  } );

  it( 'counts requests that have no usable id without generating one', () => {
    const result = parseRequestDetails( {
      requestsHeaders: [ undefined, null, {}, { 'request-id': '' }, { 'request-id': 'req-1' } ],
      duration: 1
    } );

    expect( result ).toEqual( { ids: [ 'req-1' ], count: 5, duration: 1 } );
  } );

  it( 'returns no ids and a zero count without requests', () => {
    expect( parseRequestDetails( { requestsHeaders: [], duration: 5 } ) ).toEqual( { ids: [], count: 0, duration: 5 } );
  } );
} );
