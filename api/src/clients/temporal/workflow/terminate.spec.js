import { describe, it, expect, vi } from 'vitest';
import { terminate as terminateWorkflow } from './terminate.js';

describe( 'terminate', () => {
  it( 'terminates a pinned run with the provided reason and returns the provided runId', async () => {
    const temporalTerminate = vi.fn().mockResolvedValue( undefined );
    const describe = vi.fn();
    const getHandle = vi.fn().mockReturnValue( { terminate: temporalTerminate, describe } );
    const client = { workflow: { getHandle } };

    const result = await terminateWorkflow( { client }, 'workflow-id', 'bad data', 'run-id' );

    expect( getHandle ).toHaveBeenCalledWith( 'workflow-id', 'run-id' );
    expect( temporalTerminate ).toHaveBeenCalledWith( 'bad data' );
    expect( describe ).not.toHaveBeenCalled();
    expect( result ).toEqual( { workflowId: 'workflow-id', runId: 'run-id' } );
  } );

  it( 'passes undefined reason through and resolves latest runId when no runId is provided', async () => {
    const temporalTerminate = vi.fn().mockResolvedValue( undefined );
    const describe = vi.fn().mockResolvedValue( { runId: 'resolved-run' } );
    const getHandle = vi.fn().mockReturnValue( { terminate: temporalTerminate, describe } );
    const client = { workflow: { getHandle } };

    const result = await terminateWorkflow( { client }, 'workflow-id', undefined, undefined );

    expect( getHandle ).toHaveBeenCalledWith( 'workflow-id', undefined );
    expect( temporalTerminate ).toHaveBeenCalledWith( undefined );
    expect( describe ).toHaveBeenCalled();
    expect( result ).toEqual( { workflowId: 'workflow-id', runId: 'resolved-run' } );
  } );

  it( 'throws if Temporal does not report a runId for latest-run termination', async () => {
    const temporalTerminate = vi.fn().mockResolvedValue( undefined );
    const describe = vi.fn().mockResolvedValue( {} );
    const getHandle = vi.fn().mockReturnValue( { terminate: temporalTerminate, describe } );
    const client = { workflow: { getHandle } };

    await expect( terminateWorkflow( { client }, 'workflow-id' ) ).rejects.toThrow( /did not report a runId/ );
  } );
} );
