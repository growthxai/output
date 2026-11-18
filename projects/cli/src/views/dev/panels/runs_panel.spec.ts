import { describe, expect, it } from 'vitest';
import { buildVisibleRuns } from './runs_panel.js';
import type { WorkflowRun } from '#services/workflow_runs.js';

const run = ( overrides: Partial<WorkflowRun> ): WorkflowRun => ( {
  workflowId: 'wf',
  workflowType: 'demo',
  status: 'completed',
  startedAt: '2026-04-28T18:56:53Z',
  completedAt: '2026-04-28T18:56:57Z',
  ...overrides
} as WorkflowRun );

describe( 'buildVisibleRuns', () => {
  it( 'drops completed $catalog rows', () => {
    const runs = [
      run( { workflowType: '$catalog', status: 'completed' } ),
      run( { workflowType: 'demo', status: 'completed' } )
    ];
    const visible = buildVisibleRuns( runs, '' );
    expect( visible.map( r => r.workflowType ) ).toEqual( [ 'demo' ] );
  } );

  it( 'keeps non-completed $catalog rows for diagnostics', () => {
    const runs = [
      run( { workflowType: '$catalog', status: 'running' } ),
      run( { workflowType: '$catalog', status: 'failed' } )
    ];
    const visible = buildVisibleRuns( runs, '' );
    expect( visible ).toHaveLength( 2 );
  } );

  it( 'sorts running before failed before completed', () => {
    const runs = [
      run( { workflowType: 'a', status: 'completed' } ),
      run( { workflowType: 'b', status: 'running' } ),
      run( { workflowType: 'c', status: 'failed' } )
    ];
    const visible = buildVisibleRuns( runs, '' );
    expect( visible.map( r => r.status ) ).toEqual( [ 'running', 'failed', 'completed' ] );
  } );

  it( 'sorts within the same status by startedAt descending', () => {
    const runs = [
      run( { workflowId: 'old', startedAt: '2026-04-01T00:00:00Z' } ),
      run( { workflowId: 'new', startedAt: '2026-04-28T00:00:00Z' } )
    ];
    const visible = buildVisibleRuns( runs, '' );
    expect( visible.map( r => r.workflowId ) ).toEqual( [ 'new', 'old' ] );
  } );

  it( 'filters by query against workflowType, workflowId, and status', () => {
    const runs = [
      run( { workflowType: 'apple', workflowId: 'wf-1' } ),
      run( { workflowType: 'banana', workflowId: 'wf-2' } )
    ];
    expect( buildVisibleRuns( runs, 'apple' ) ).toHaveLength( 1 );
    expect( buildVisibleRuns( runs, 'wf-2' ) ).toHaveLength( 1 );
    expect( buildVisibleRuns( runs, 'completed' ) ).toHaveLength( 2 );
    expect( buildVisibleRuns( runs, 'no-match' ) ).toHaveLength( 0 );
  } );
} );
