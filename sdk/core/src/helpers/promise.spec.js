import { describe, it, expect, vi } from 'vitest';
import { CancellablePromise } from './promise.js';

describe( 'CancellablePromise', () => {
  it( 'exposes a pending promise until it is completed', async () => {
    const cancellable = new CancellablePromise();
    const onComplete = vi.fn();

    cancellable.promise.then( onComplete );
    await Promise.resolve();

    expect( cancellable.completed ).toBe( false );
    expect( onComplete ).not.toHaveBeenCalled();

    cancellable.complete();
    await cancellable.promise;

    expect( cancellable.completed ).toBe( true );
    expect( onComplete ).toHaveBeenCalledOnce();
  } );

  it( 'can be completed multiple times without resolving again', async () => {
    const cancellable = new CancellablePromise();
    const onComplete = vi.fn();

    cancellable.promise.then( onComplete );
    cancellable.complete();
    cancellable.complete();
    await cancellable.promise;
    await Promise.resolve();

    expect( cancellable.completed ).toBe( true );
    expect( onComplete ).toHaveBeenCalledOnce();
  } );
} );
