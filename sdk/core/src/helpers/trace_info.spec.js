import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TraceInfo } from './trace_info.js';

const inWorkflowContextMock = vi.hoisted( () => vi.fn() );
const workflowInfoMock = vi.hoisted( () => vi.fn() );

vi.mock( '@temporalio/workflow', () => ( {
  inWorkflowContext: inWorkflowContextMock,
  workflowInfo: workflowInfoMock
} ) );

describe( 'TraceInfo', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'builds trace info from Temporal workflow info in workflow context', () => {
    inWorkflowContextMock.mockReturnValue( true );
    workflowInfoMock.mockReturnValue( {
      workflowId: 'workflow-id',
      workflowType: 'workflow-type',
      runId: 'run-id',
      startTime: new Date( '2026-06-02T09:00:00.000Z' )
    } );

    expect( TraceInfo.build() ).toEqual( {
      workflowId: 'workflow-id',
      workflowType: 'workflow-type',
      runId: 'run-id',
      startTime: Date.parse( '2026-06-02T09:00:00.000Z' )
    } );
  } );

  it( 'builds trace info without Temporal fields outside workflow context', () => {
    inWorkflowContextMock.mockReturnValue( false );

    expect( TraceInfo.build() ).toEqual( {
      workflowId: undefined,
      workflowType: undefined,
      runId: undefined,
      startTime: undefined
    } );
    expect( workflowInfoMock ).not.toHaveBeenCalled();
  } );
} );
