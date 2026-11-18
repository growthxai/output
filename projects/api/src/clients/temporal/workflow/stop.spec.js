import { describe, it, expect, vi } from 'vitest';
import { stop } from './stop.js';

describe( 'stop', () => {
  it( 'cancels a pinned run and returns the provided runId without describing', async () => {
    const cancel = vi.fn().mockResolvedValue( undefined );
    const describe = vi.fn();
    const getHandle = vi.fn().mockReturnValue( { cancel, describe } );
    const client = { workflow: { getHandle } };

    const result = await stop( { client }, 'workflow-id', 'run-id' );

    expect( getHandle ).toHaveBeenCalledWith( 'workflow-id', 'run-id' );
    expect( cancel ).toHaveBeenCalled();
    expect( describe ).not.toHaveBeenCalled();
    expect( result ).toEqual( { workflowId: 'workflow-id', runId: 'run-id' } );
  } );

  it( 'resolves the latest runId after canceling when no runId is provided', async () => {
    const cancel = vi.fn().mockResolvedValue( undefined );
    const describe = vi.fn().mockResolvedValue( { runId: 'resolved-run' } );
    const getHandle = vi.fn().mockReturnValue( { cancel, describe } );
    const client = { workflow: { getHandle } };

    const result = await stop( { client }, 'workflow-id' );

    expect( getHandle ).toHaveBeenCalledWith( 'workflow-id', undefined );
    expect( cancel ).toHaveBeenCalled();
    expect( describe ).toHaveBeenCalled();
    expect( result ).toEqual( { workflowId: 'workflow-id', runId: 'resolved-run' } );
  } );

  it( 'throws if Temporal does not report a runId for latest-run cancellation', async () => {
    const cancel = vi.fn().mockResolvedValue( undefined );
    const describe = vi.fn().mockResolvedValue( {} );
    const getHandle = vi.fn().mockReturnValue( { cancel, describe } );
    const client = { workflow: { getHandle } };

    await expect( stop( { client }, 'workflow-id' ) ).rejects.toThrow( /did not report a runId/ );
  } );
} );
