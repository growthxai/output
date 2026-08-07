import { describe, it, expect, vi } from 'vitest';
import { runOnce, tryOrUndefined } from './function.js';

describe( 'runOnce', () => {
  it( 'calls the wrapped function only once', () => {
    const fn = vi.fn();
    const once = runOnce( fn );

    once();
    once();
    once();

    expect( fn ).toHaveBeenCalledOnce();
  } );

  it( 'passes arguments and replays the first call result', () => {
    const fn = vi.fn( ( a, b ) => a + b );
    const once = runOnce( fn );

    expect( once( 2, 3 ) ).toBe( 5 );
    expect( once( 4, 5 ) ).toBe( 5 );
    expect( once( 6, 7 ) ).toBe( 5 );
    expect( fn ).toHaveBeenCalledWith( 2, 3 );
    expect( fn ).toHaveBeenCalledOnce();
  } );

  it( 'replays the first returned promise', () => {
    const result = Promise.resolve( 'done' );
    const fn = vi.fn( () => result );
    const once = runOnce( fn );

    expect( once() ).toBe( result );
    expect( once() ).toBe( result );
    expect( fn ).toHaveBeenCalledOnce();
  } );

  it( 'does not retry when the first call throws', () => {
    const error = new Error( 'boom' );
    const fn = vi.fn( () => {
      throw error;
    } );
    const once = runOnce( fn );

    expect( () => once() ).toThrow( error );
    expect( once() ).toBeUndefined();
    expect( fn ).toHaveBeenCalledOnce();
  } );
} );

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
