/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '#services/workflow_runs.js', () => ( {
  fetchWorkflowRuns: vi.fn()
} ) );

describe( 'workflow runs list command', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  const createCommand = async ( flagOverrides: Record<string, unknown> = {} ) => {
    const WorkflowRunsList = ( await import( './list.js' ) ).default;
    const { fetchWorkflowRuns } = await import( '#services/workflow_runs.js' );

    const cmd = new WorkflowRunsList( [], {} as any );
    cmd.log = vi.fn();
    cmd.warn = vi.fn() as any;
    ( cmd as any ).jsonEnabled = vi.fn().mockReturnValue( false );
    ( cmd as any ).parse = vi.fn().mockResolvedValue( {
      args: { workflowName: undefined },
      flags: { catalog: undefined, limit: 100, format: 'table', ...flagOverrides }
    } );

    return { cmd, fetchWorkflowRuns: vi.mocked( fetchWorkflowRuns ) };
  };

  it( 'reports the actual number of returned runs, not the API\'s pre-filter count', async () => {
    const { cmd, fetchWorkflowRuns } = await createCommand();
    fetchWorkflowRuns.mockResolvedValue( {
      runs: [ { workflowId: 'wf-1', workflowType: 'demo', status: 'completed', startedAt: '2026-01-01T00:00:00Z', completedAt: null } ],
      skipped: 1,
      count: 2
    } as any );

    await cmd.run();

    expect( cmd.log ).toHaveBeenCalledWith( expect.stringContaining( 'Found 1 run(s)' ) );
  } );

  it( 'warns when runs were skipped for missing a workflow ID', async () => {
    const { cmd, fetchWorkflowRuns } = await createCommand();
    fetchWorkflowRuns.mockResolvedValue( { runs: [], skipped: 2, count: 2 } as any );

    await cmd.run();

    expect( cmd.warn ).toHaveBeenCalledWith( expect.stringContaining( 'no workflow ID' ) );
  } );

  it( 'does not warn when no runs were skipped', async () => {
    const { cmd, fetchWorkflowRuns } = await createCommand();
    fetchWorkflowRuns.mockResolvedValue( { runs: [], skipped: 0, count: 0 } as any );

    await cmd.run();

    expect( cmd.warn ).not.toHaveBeenCalled();
  } );
} );
