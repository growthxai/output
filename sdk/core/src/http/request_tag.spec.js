import { describe, expect, it } from 'vitest';
import { Response } from 'undici';
import { addRequestIdToResponse, requestIdSymbol } from './request_tag.js';

describe( 'addRequestIdToResponse', () => {
  it( 'stores an immutable, non-enumerable request id', () => {
    const response = new Response( 'ok' );

    addRequestIdToResponse( response, 'request-1' );

    expect( response[requestIdSymbol] ).toBe( 'request-1' );
    expect( Object.getOwnPropertyDescriptor( response, requestIdSymbol ) ).toEqual( {
      value: 'request-1',
      enumerable: false,
      configurable: false,
      writable: false
    } );
  } );

  it( 'propagates the request id through repeated clones', () => {
    const response = new Response( 'ok' );
    addRequestIdToResponse( response, 'request-clone' );

    const clone = response.clone();
    const grandchild = clone.clone();

    expect( clone[requestIdSymbol] ).toBe( 'request-clone' );
    expect( grandchild[requestIdSymbol] ).toBe( 'request-clone' );
  } );
} );
