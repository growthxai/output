import { describe, it, expect, vi } from 'vitest';
import { startWorkflowExecution } from './start_workflow_execution.js';

describe( 'startWorkflowExecution', () => {
  it( 'passes the resolved name and start options through to client.workflow.start', async () => {
    const handle = { firstExecutionRunId: 'run-1' };
    const start = vi.fn().mockResolvedValue( handle );
    const client = { workflow: { start } };
    const startOptions = { args: [ { value: 1 } ], taskQueue: 'queue', workflowId: 'wf-1' };

    const result = await startWorkflowExecution( client, 'resolved-workflow', startOptions );

    expect( result ).toBe( handle );
    expect( start ).toHaveBeenCalledTimes( 1 );
    expect( start ).toHaveBeenCalledWith( 'resolved-workflow', startOptions );
  } );

  it( 'propagates errors from client.workflow.start', async () => {
    const error = new Error( 'connection lost' );
    const client = { workflow: { start: vi.fn().mockRejectedValue( error ) } };

    await expect( startWorkflowExecution( client, 'resolved-workflow', {} ) ).rejects.toBe( error );
  } );
} );
