import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadMock = vi.fn();
vi.mock( '#async_storage', () => ( {
  Storage: { load: loadMock }
} ) );

describe( 'Context.getActivityContext', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.resetModules();
  } );

  it( 'returns null when no context is stored', async () => {
    loadMock.mockReturnValue( undefined );
    const { Context } = await import( './index.js' );
    expect( Context.getActivityContext() ).toBeNull();
  } );

  it( 'returns activity execution context from storage', async () => {
    const activityInfo = {
      activityId: 'activity-1',
      activityType: 'myActivity',
      workflowExecution: { workflowId: 'wf-1', runId: 'run-1' },
      workflowType: 'myWorkflow'
    };
    loadMock.mockReturnValue( {
      activityInfo,
      workflowFilename: '/workflows/myWorkflow.js'
    } );
    const { Context } = await import( './index.js' );
    expect( Context.getActivityContext() ).toEqual( {
      activityInfo,
      workflowFilename: '/workflows/myWorkflow.js'
    } );
  } );
} );
