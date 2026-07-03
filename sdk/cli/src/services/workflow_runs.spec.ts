import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock( '#api/generated/api.js', () => ( {
  getWorkflowRuns: vi.fn()
} ) );

import { getWorkflowRuns, type getWorkflowRunsResponse } from '#api/generated/api.js';
import { fetchWorkflowRuns } from '#services/workflow_runs.js';

describe( 'fetchWorkflowRuns', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'filters out runs with no workflow ID and reports how many were skipped', async () => {
    vi.mocked( getWorkflowRuns ).mockResolvedValue( {
      data: {
        runs: [ { workflowId: 'wf-1' }, { workflowId: undefined }, { workflowId: 'wf-2' } ],
        count: 3
      },
      status: 200,
      headers: new Headers()
    } as getWorkflowRunsResponse );

    const result = await fetchWorkflowRuns();

    expect( result.runs.map( run => run.workflowId ) ).toEqual( [ 'wf-1', 'wf-2' ] );
    expect( result.skipped ).toBe( 1 );
    expect( result.count ).toBe( 3 );
  } );

  it( 'reports zero skipped when every run has a workflow ID', async () => {
    vi.mocked( getWorkflowRuns ).mockResolvedValue( {
      data: { runs: [ { workflowId: 'wf-1' } ], count: 1 },
      status: 200,
      headers: new Headers()
    } as getWorkflowRunsResponse );

    const result = await fetchWorkflowRuns();

    expect( result.skipped ).toBe( 0 );
    expect( result.runs ).toHaveLength( 1 );
  } );

  it( 'throws when the API server cannot be reached', async () => {
    vi.mocked( getWorkflowRuns ).mockResolvedValue( undefined as unknown as getWorkflowRunsResponse );

    await expect( fetchWorkflowRuns() ).rejects.toThrow( 'Failed to connect to API server' );
  } );
} );
