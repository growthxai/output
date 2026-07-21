import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPendingHooks, pendingHooks } from './pending_hooks.js';

describe( 'pending hooks', () => {
  beforeEach( () => {
    pendingHooks.clear();
  } );

  afterEach( () => {
    pendingHooks.clear();
    vi.useRealTimers();
  } );

  it( 'waits for pending hooks to settle', async () => {
    const deferred = { resolve: null };
    const hookPromise = new Promise( resolve => {
      deferred.resolve = resolve;
    } );
    pendingHooks.add( hookPromise );

    const flushPromise = flushPendingHooks();
    const state = { flushed: false };
    flushPromise.then( () => {
      state.flushed = true;
    } );

    await Promise.resolve();
    expect( state.flushed ).toBe( false );

    deferred.resolve();
    await flushPromise;
    expect( state.flushed ).toBe( true );
  } );

  it( 'stops waiting after the timeout', async () => {
    vi.useFakeTimers();
    pendingHooks.add( new Promise( () => {} ) );

    const flushPromise = flushPendingHooks();
    await vi.advanceTimersByTimeAsync( 30_000 );

    await expect( flushPromise ).resolves.toBeUndefined();
  } );
} );
