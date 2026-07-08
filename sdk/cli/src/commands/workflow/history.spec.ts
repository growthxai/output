/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';

// Isolate the command module from the API/service layer at import time. Must use the
// `#`-aliased specifier — history.ts imports via that alias, and a relative specifier here
// resolves to a different module id, so the mock silently never intercepts the real import.
vi.mock( '#services/workflow_history.js', () => ( {
  fetchWorkflowHistory: vi.fn()
} ) );

describe( 'workflow history command', () => {
  it( 'exports a valid OCLIF command with a workflowId arg', async () => {
    const WorkflowHistory = ( await import( './history.js' ) ).default;
    expect( WorkflowHistory ).toBeDefined();
    expect( WorkflowHistory.description ).toContain( 'waterfall' );
    expect( WorkflowHistory.args ).toHaveProperty( 'workflowId' );
    expect( WorkflowHistory.args.workflowId.required ).toBe( true );
  } );

  it( 'declares the expected flags and defaults', async () => {
    const WorkflowHistory = ( await import( './history.js' ) ).default;
    const flags = WorkflowHistory.flags;

    expect( flags ).toHaveProperty( 'run-id' );
    expect( flags ).toHaveProperty( 'raw' );
    expect( flags ).toHaveProperty( 'include-payloads' );
    expect( flags ).toHaveProperty( 'color' );
    expect( flags ).toHaveProperty( 'width' );

    expect( flags.format.options ).toEqual( [ 'text', 'json' ] );
    expect( flags.format.default ).toBe( 'text' );
    expect( flags.raw.default ).toBe( false );
  } );

  describe( 'run() --raw', () => {
    it( 'prints the server\'s literal status, not the client-normalized one', async () => {
      const WorkflowHistory = ( await import( './history.js' ) ).default;
      const { fetchWorkflowHistory } = await import( '#services/workflow_history.js' );

      // `workflow` carries the normalized status (what monitor/waterfall consume);
      // `rawWorkflow` is the untouched server value — `--raw` must use the latter.
      vi.mocked( fetchWorkflowHistory ).mockResolvedValueOnce( {
        workflow: { workflowId: 'wf-1', runId: 'run-1', status: 'continued_as_new' },
        rawWorkflow: { workflowId: 'wf-1', runId: 'run-1', status: 'continued' },
        runId: 'run-1',
        events: [],
        spans: [],
        totalDurationMs: 0,
        continuedAsNewRunId: null
      } as any );

      const cmd = new WorkflowHistory( [ 'wf-1', '--raw' ], {} as any );
      cmd.log = vi.fn();
      ( cmd as any ).parse = vi.fn().mockResolvedValue( {
        args: { workflowId: 'wf-1' },
        flags: { 'run-id': undefined, format: 'text', raw: true, 'include-payloads': false, width: undefined, color: false }
      } );

      await cmd.run();

      const printed = JSON.parse( ( cmd.log as ReturnType<typeof vi.fn> ).mock.calls[0][0] as string );
      expect( printed.workflow.status ).toBe( 'continued' );
    } );
  } );
} );
