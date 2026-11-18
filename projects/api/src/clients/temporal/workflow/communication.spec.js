import { describe, it, expect, vi } from 'vitest';
import { executeUpdate, query, signal } from './communication.js';

describe( 'workflow communication methods', () => {
  it( 'queries the workflow handle with variadic args', async () => {
    const temporalQuery = vi.fn().mockResolvedValue( { ok: true } );
    const getHandle = vi.fn().mockReturnValue( { query: temporalQuery } );
    const client = { workflow: { getHandle } };

    const result = await query( { client }, 'workflow-id', 'getState', { arg: true }, 'extra' );

    expect( getHandle ).toHaveBeenCalledWith( 'workflow-id' );
    expect( temporalQuery ).toHaveBeenCalledWith( 'getState', { arg: true }, 'extra' );
    expect( result ).toEqual( { ok: true } );
  } );

  it( 'queries the workflow handle without args', async () => {
    const temporalQuery = vi.fn().mockResolvedValue( { ok: true } );
    const getHandle = vi.fn().mockReturnValue( { query: temporalQuery } );
    const client = { workflow: { getHandle } };

    await query( { client }, 'workflow-id', 'getState' );

    expect( temporalQuery ).toHaveBeenCalledWith( 'getState' );
  } );

  it( 'signals the workflow handle with payload', async () => {
    const temporalSignal = vi.fn().mockResolvedValue( undefined );
    const getHandle = vi.fn().mockReturnValue( { signal: temporalSignal } );
    const client = { workflow: { getHandle } };

    await signal( { client }, 'workflow-id', 'resume', { approved: true } );

    expect( getHandle ).toHaveBeenCalledWith( 'workflow-id' );
    expect( temporalSignal ).toHaveBeenCalledWith( 'resume', { approved: true } );
  } );

  it( 'executes workflow update with payload wrapped as the single arg', async () => {
    const temporalExecuteUpdate = vi.fn().mockResolvedValue( { updated: true } );
    const getHandle = vi.fn().mockReturnValue( { executeUpdate: temporalExecuteUpdate } );
    const client = { workflow: { getHandle } };

    const result = await executeUpdate( { client }, 'workflow-id', 'approve', { approved: true } );

    expect( getHandle ).toHaveBeenCalledWith( 'workflow-id' );
    expect( temporalExecuteUpdate ).toHaveBeenCalledWith( 'approve', { args: [ { approved: true } ] } );
    expect( result ).toEqual( { updated: true } );
  } );
} );
