import { describe, it, expect, vi } from 'vitest';
import { hasErrorType, executeInParallel } from './workflow_utils.js';

describe( 'executeInParallel', () => {
  it( 'returns empty array for empty jobs', async () => {
    const results = await executeInParallel( { jobs: [] } );
    expect( results ).toEqual( [] );
  } );

  it( 'executes all jobs and returns results', async () => {
    const jobs = [
      () => Promise.resolve( 'a' ),
      () => Promise.resolve( 'b' ),
      () => Promise.resolve( 'c' )
    ];

    const results = await executeInParallel( { jobs } );

    expect( results ).toHaveLength( 3 );
    expect( results ).toContainEqual( { ok: true, result: 'a', index: 0 } );
    expect( results ).toContainEqual( { ok: true, result: 'b', index: 1 } );
    expect( results ).toContainEqual( { ok: true, result: 'c', index: 2 } );
  } );

  it( 'handles job failures without throwing', async () => {
    const error = new Error( 'job failed' );
    const jobs = [
      () => Promise.resolve( 'ok' ),
      () => Promise.reject( error )
    ];

    const results = await executeInParallel( { jobs } );

    expect( results ).toHaveLength( 2 );
    expect( results ).toContainEqual( { ok: true, result: 'ok', index: 0 } );
    expect( results ).toContainEqual( { ok: false, error, index: 1 } );
  } );

  it( 'handles all jobs failing', async () => {
    const errors = [ new Error( 'e1' ), new Error( 'e2' ) ];
    const jobs = [
      () => Promise.reject( errors[0] ),
      () => Promise.reject( errors[1] )
    ];

    const results = await executeInParallel( { jobs } );

    expect( results ).toHaveLength( 2 );
    expect( results ).toContainEqual( { ok: false, error: errors[0], index: 0 } );
    expect( results ).toContainEqual( { ok: false, error: errors[1], index: 1 } );
  } );

  it( 'respects concurrency limit', async () => {
    const tracker = { active: 0, max: 0 };

    const createJob = ( id, delay ) => async () => {
      tracker.active++;
      tracker.max = Math.max( tracker.max, tracker.active );
      await new Promise( r => setTimeout( r, delay ) );
      tracker.active--;
      return id;
    };

    const jobs = [
      createJob( 'a', 50 ),
      createJob( 'b', 50 ),
      createJob( 'c', 50 ),
      createJob( 'd', 50 )
    ];

    await executeInParallel( { jobs, concurrency: 2 } );

    expect( tracker.max ).toBe( 2 );
  } );

  it( 'runs all jobs concurrently when concurrency is Infinity', async () => {
    const tracker = { active: 0, max: 0 };

    const createJob = delay => async () => {
      tracker.active++;
      tracker.max = Math.max( tracker.max, tracker.active );
      await new Promise( r => setTimeout( r, delay ) );
      tracker.active--;
      return 'done';
    };

    const jobs = [ createJob( 30 ), createJob( 30 ), createJob( 30 ), createJob( 30 ) ];

    await executeInParallel( { jobs } );

    expect( tracker.max ).toBe( 4 );
  } );

  it( 'calls onJobCompleted for each job', async () => {
    const onJobCompleted = vi.fn();
    const jobs = [
      () => Promise.resolve( 'a' ),
      () => Promise.resolve( 'b' )
    ];

    await executeInParallel( { jobs, onJobCompleted } );

    expect( onJobCompleted ).toHaveBeenCalledTimes( 2 );
    expect( onJobCompleted ).toHaveBeenCalledWith( expect.objectContaining( { ok: true, result: 'a', index: 0 } ) );
    expect( onJobCompleted ).toHaveBeenCalledWith( expect.objectContaining( { ok: true, result: 'b', index: 1 } ) );
  } );

  it( 'works without onJobCompleted callback', async () => {
    const jobs = [ () => Promise.resolve( 'x' ) ];

    const results = await executeInParallel( { jobs } );

    expect( results ).toEqual( [ { ok: true, result: 'x', index: 0 } ] );
  } );

  it( 'handles synchronous job functions', async () => {
    const jobs = [
      () => 'sync-a',
      () => 'sync-b'
    ];

    const results = await executeInParallel( { jobs } );

    expect( results ).toContainEqual( { ok: true, result: 'sync-a', index: 0 } );
    expect( results ).toContainEqual( { ok: true, result: 'sync-b', index: 1 } );
  } );

  it( 'handles synchronous throwing job functions', async () => {
    const error = new Error( 'sync throw' );
    const jobs = [
      () => {
        throw error;
      }
    ];

    const results = await executeInParallel( { jobs } );

    expect( results ).toEqual( [ { ok: false, error, index: 0 } ] );
  } );

  it( 'handles concurrency greater than job count', async () => {
    const jobs = [ () => 'only-one' ];

    const results = await executeInParallel( { jobs, concurrency: 10 } );

    expect( results ).toEqual( [ { ok: true, result: 'only-one', index: 0 } ] );
  } );

  it( 'calls onJobCompleted in completion order, not submission order', async () => {
    const completionOrder = [];
    const onJobCompleted = result => completionOrder.push( result.index );

    const jobs = [
      async () => {
        await new Promise( r => setTimeout( r, 60 ) );
        return 'slow';
      },
      async () => {
        await new Promise( r => setTimeout( r, 10 ) );
        return 'fast';
      }
    ];

    await executeInParallel( { jobs, onJobCompleted } );

    expect( completionOrder ).toEqual( [ 1, 0 ] ); // fast (index 1) completes before slow (index 0)
  } );

  it( 'returns results sorted by job index for determinism', async () => {
    const jobs = [
      async () => {
        await new Promise( r => setTimeout( r, 60 ) );
        return 'slow';
      },
      async () => {
        await new Promise( r => setTimeout( r, 10 ) );
        return 'fast';
      }
    ];

    const results = await executeInParallel( { jobs } );

    expect( results[0].index ).toBe( 0 );
    expect( results[1].index ).toBe( 1 );
    expect( results ).toEqual( [
      { ok: true, result: 'slow', index: 0 },
      { ok: true, result: 'fast', index: 1 }
    ] );
  } );
} );

describe( 'hasErrorType', () => {
  class FooError extends Error {}

  it( 'matches a direct error instance', () => {
    expect( hasErrorType( new FooError( 'foo' ), FooError ) ).toBe( true );
  } );

  it( 'matches an error instance in the cause chain', () => {
    const error = new Error( 'outer', {
      cause: new Error( 'middle', {
        cause: new FooError( 'foo' )
      } )
    } );

    expect( hasErrorType( error, FooError ) ).toBe( true );
  } );

  it( 'matches Temporal ApplicationFailure type in the cause chain', () => {
    const applicationFailure = Object.assign( new Error( 'foo' ), {
      name: 'ApplicationFailure',
      type: 'FooError'
    } );
    const activityFailure = Object.assign( new Error( 'Activity execution failed', {
      cause: applicationFailure
    } ), {
      name: 'ActivityFailure'
    } );

    expect( hasErrorType( activityFailure, FooError ) ).toBe( true );
  } );

  it( 'matches a serialized error name', () => {
    const error = Object.assign( new Error( 'foo' ), { name: 'FooError' } );

    expect( hasErrorType( error, FooError ) ).toBe( true );
  } );

  it( 'matches an error serialized as its type name', () => {
    expect( hasErrorType( 'FooError', FooError ) ).toBe( true );
  } );

  it( 'matches an error type in a plain object cause chain', () => {
    const error = {
      name: 'ActivityFailure',
      cause: {
        name: 'ApplicationFailure',
        type: 'FooError'
      }
    };

    expect( hasErrorType( error, FooError ) ).toBe( true );
  } );

  it.each( [ null, undefined, '', 42, false ] )( 'returns false for unsupported error value %j', error => {
    expect( hasErrorType( error, FooError ) ).toBe( false );
  } );

  it( 'returns false when ErrorType is not a class', () => {
    expect( hasErrorType( new FooError( 'foo' ), null ) ).toBe( false );
  } );

  it( 'returns false when the requested error type is absent', () => {
    const error = new Error( 'outer', { cause: new TypeError( 'inner' ) } );

    expect( hasErrorType( error, FooError ) ).toBe( false );
  } );

  it( 'keeps plain Error matching backwards compatible', () => {
    expect( hasErrorType( new Error( 'foo' ), Error ) ).toBe( true );
  } );

  it( 'stops traversing cause chains after the depth limit', () => {
    const createCauseChain = depth => depth === 20 ?
      new FooError( 'foo' ) :
      new Error( `depth-${depth}`, { cause: createCauseChain( depth + 1 ) } );
    const root = new Error( 'root', { cause: createCauseChain( 0 ) } );

    expect( hasErrorType( root, FooError ) ).toBe( false );
  } );
} );
