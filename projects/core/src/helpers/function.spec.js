import { describe, it, expect, vi } from 'vitest';
import { tryOrUndefined } from './function.js';

describe( 'tryOrUndefined', () => {
  it( 'returns the invoked function result', () => {
    const fn = vi.fn( () => 'result' );

    expect( tryOrUndefined( fn ) ).toBe( 'result' );
    expect( fn ).toHaveBeenCalledOnce();
  } );

  it( 'returns undefined when the invoked function throws', () => {
    const fn = vi.fn( () => {
      throw new Error( 'unavailable' );
    } );

    expect( tryOrUndefined( fn ) ).toBeUndefined();
    expect( fn ).toHaveBeenCalledOnce();
  } );

  it( 'preserves an explicit undefined result', () => {
    expect( tryOrUndefined( () => undefined ) ).toBeUndefined();
  } );
} );
