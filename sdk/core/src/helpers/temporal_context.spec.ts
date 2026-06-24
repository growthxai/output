import type { WorkflowInfo } from '@temporalio/workflow';
import { describe, expect, it } from 'vitest';
import { createWorkflowDetails } from './temporal_context.js';

/*
  This spec is TypeScript on purpose.
  createWorkflowDetails() accepts a small projection of Temporal's WorkflowInfo,
  so the fixture below uses Pick<WorkflowInfo, ...> to catch Temporal type drift
  without exposing or maintaining the full native object in hook payloads.
*/
type WorkflowDetailsSource = Pick<
  WorkflowInfo,
  'attempt' |
  'continuedFromExecutionRunId' |
  'firstExecutionRunId' |
  'parent' |
  'root' |
  'runId' |
  'runStartTime' |
  'startTime' |
  'workflowId' |
  'workflowType'
>;

describe( 'createWorkflowDetails', () => {
  it( 'creates hook-safe workflow details from Temporal workflow info', () => {
    const parent = { workflowId: 'parent-wf', runId: 'parent-run', namespace: 'default' };
    const root = { workflowId: 'root-wf', runId: 'root-run' };
    const workflowInfo = {
      attempt: 2,
      continuedFromExecutionRunId: 'previous-run',
      firstExecutionRunId: 'first-run',
      parent,
      root,
      runId: 'current-run',
      runStartTime: new Date( '2026-06-02T09:30:00.000Z' ),
      startTime: new Date( '2026-06-02T09:00:00.000Z' ),
      workflowId: 'workflow-id',
      workflowType: 'prompt'
    } satisfies WorkflowDetailsSource;

    expect( createWorkflowDetails( workflowInfo ) ).toEqual( {
      attempt: 2,
      continuedFromExecutionRunId: 'previous-run',
      firstExecutionRunId: 'first-run',
      parent,
      root,
      runId: 'current-run',
      runStartTime: Date.parse( '2026-06-02T09:30:00.000Z' ),
      startTime: Date.parse( '2026-06-02T09:00:00.000Z' ),
      workflowId: 'workflow-id',
      workflowType: 'prompt'
    } );
  } );

  it( 'preserves absent optional workflow relationships as undefined', () => {
    const workflowInfo = {
      attempt: 1,
      continuedFromExecutionRunId: undefined,
      firstExecutionRunId: 'first-run',
      parent: undefined,
      root: undefined,
      runId: 'current-run',
      runStartTime: new Date( '2026-06-02T09:30:00.000Z' ),
      startTime: new Date( '2026-06-02T09:00:00.000Z' ),
      workflowId: 'workflow-id',
      workflowType: 'prompt'
    } satisfies WorkflowDetailsSource;

    expect( createWorkflowDetails( workflowInfo ) ).toEqual( {
      attempt: 1,
      continuedFromExecutionRunId: undefined,
      firstExecutionRunId: 'first-run',
      parent: undefined,
      root: undefined,
      runId: 'current-run',
      runStartTime: Date.parse( '2026-06-02T09:30:00.000Z' ),
      startTime: Date.parse( '2026-06-02T09:00:00.000Z' ),
      workflowId: 'workflow-id',
      workflowType: 'prompt'
    } );
  } );
} );
