import { describe, it, expect } from 'vitest';
import { serializedActivityFields } from './context_fields.js';

describe( 'serializedActivityFields', () => {
  it( 'flattens Temporal activityInfo into log context fields', () => {
    const activityInfo = {
      activityId: 'activity-1',
      activityType: 'myActivity',
      workflowExecution: { workflowId: 'wf-1', runId: 'run-1' },
      workflowType: 'myWorkflow'
    };

    expect( serializedActivityFields( activityInfo ) ).toEqual( {
      activityId: 'activity-1',
      activityType: 'myActivity',
      workflowId: 'wf-1',
      workflowType: 'myWorkflow',
      runId: 'run-1'
    } );
  } );
} );
