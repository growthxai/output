import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logMock = vi.hoisted( () => ( { warn: vi.fn() } ) );

vi.mock( '#logger', () => ( { createChildLogger: () => logMock } ) );

import { flushPendingHooks, pendingHooks } from './pending_hooks.js';

describe( 'pending hooks', () => {
  beforeEach( () => {
    pendingHooks.clear();
    vi.clearAllMocks();
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

    const flushPromise = flushPendingHooks( 5000 );
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

    const flushPromise = flushPendingHooks( 5000 );
    await vi.advanceTimersByTimeAsync( 5000 );

    await expect( flushPromise ).resolves.toBeUndefined();
  } );

  it( 'logs the number of hooks that exceeded the timeout', async () => {
    vi.useFakeTimers();
    pendingHooks.add( new Promise( () => {} ) );
    pendingHooks.add( new Promise( () => {} ) );

    const flushPromise = flushPendingHooks( 5000 );
    await vi.advanceTimersByTimeAsync( 5000 );
    await flushPromise;

    expect( logMock.warn ).toHaveBeenCalledWith( expect.any( String ), { count: 2 } );
  } );
} );
