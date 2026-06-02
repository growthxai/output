import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WorkflowContext } from './workflow_context.js';

const inWorkflowContextMock = vi.hoisted( () => vi.fn() );
const workflowInfoMock = vi.hoisted( () => vi.fn() );
const continueAsNewMock = vi.hoisted( () => vi.fn() );

vi.mock( '@temporalio/workflow', () => ( {
  continueAsNew: continueAsNewMock,
  inWorkflowContext: inWorkflowContextMock,
  workflowInfo: workflowInfoMock
} ) );

describe( 'WorkflowContext', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'builds a test context outside Temporal workflow context', async () => {
    inWorkflowContextMock.mockReturnValue( false );

    const context = WorkflowContext.build();

    expect( context.info ).toEqual( { workflowId: 'test-workflow', runId: 'test-run' } );
    expect( context.control.isContinueAsNewSuggested() ).toBe( false );
    await expect( context.control.continueAsNew() ).resolves.toBeUndefined();
    expect( workflowInfoMock ).not.toHaveBeenCalled();
    expect( continueAsNewMock ).not.toHaveBeenCalled();
  } );

  it( 'builds a workflow context from Temporal workflow info', () => {
    inWorkflowContextMock.mockReturnValue( true );
    workflowInfoMock.mockReturnValue( {
      workflowId: 'workflow-id',
      runId: 'run-id',
      continueAsNewSuggested: true
    } );

    const context = WorkflowContext.build();

    expect( context.info ).toEqual( { workflowId: 'workflow-id', runId: 'run-id' } );
    expect( context.control.continueAsNew ).toBe( continueAsNewMock );
    expect( context.control.isContinueAsNewSuggested() ).toBe( true );
    expect( workflowInfoMock ).toHaveBeenCalledTimes( 2 );
  } );
} );
