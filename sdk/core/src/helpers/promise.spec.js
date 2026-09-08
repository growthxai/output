import { describe, it, expect } from 'vitest';
import { sleepCancellable } from './promise.js';

// Long enough that a sleep reaching it means the abort was not honored and the test times out.
const neverElapses = 60000;

describe( 'sleepCancellable', () => {
  it( 'resolves only once the timeout elapses', async () => {
    const order = [];
    const sleeping = sleepCancellable( 10 ).then( () => order.push( 'slept' ) );

    await Promise.resolve();
    expect( order ).toEqual( [] );

    await sleeping;
    expect( order ).toEqual( [ 'slept' ] );
  } );

  it( 'resolves without a signal', async () => {
    await expect( sleepCancellable( 10 ) ).resolves.toBeUndefined();
  } );

  it( 'resolves immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect( sleepCancellable( neverElapses, controller.signal ) ).resolves.toBeUndefined();
  } );

  it( 'resolves as soon as the signal aborts mid sleep', async () => {
    const controller = new AbortController();
    const sleeping = sleepCancellable( neverElapses, controller.signal );

    controller.abort();

    await expect( sleeping ).resolves.toBeUndefined();
  } );

  it( 'swallows the abort reason instead of rejecting with it', async () => {
    const controller = new AbortController();
    const sleeping = sleepCancellable( neverElapses, controller.signal );

    controller.abort( new Error( 'shutting down' ) );

    await expect( sleeping ).resolves.toBeUndefined();
  } );

  it( 'rethrows a rejection that is not an abort', async () => {
    await expect( sleepCancellable( 10, {} ) ).rejects.toThrow( /AbortSignal/ );
  } );
} );
