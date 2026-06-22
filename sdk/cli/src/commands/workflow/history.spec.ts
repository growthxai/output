import { describe, it, expect, vi } from 'vitest';

// Isolate the command module from the API/service layer at import time.
vi.mock( '../../services/workflow_history.js', () => ( {
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
} );
