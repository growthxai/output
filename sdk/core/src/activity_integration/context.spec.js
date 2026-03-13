import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadMock = vi.fn();
vi.mock( '#async_storage', () => ( {
  Storage: { load: loadMock }
} ) );

describe( 'getExecutionContext', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.resetModules();
  } );

  it( 'returns null when no context is stored', async () => {
    loadMock.mockReturnValue( undefined );
    const { getExecutionContext } = await import( './index.js' );
    expect( getExecutionContext() ).toBeNull();
  } );

  it( 'returns null when executionContext is missing', async () => {
    loadMock.mockReturnValue( { workflowFilename: '/workflows/foo.js' } );
    const { getExecutionContext } = await import( './index.js' );
    expect( getExecutionContext() ).toBeNull();
  } );

  it( 'returns null when workflowFilename is missing', async () => {
    loadMock.mockReturnValue( { executionContext: { workflowId: 'wf-1', workflowName: 'myWorkflow' } } );
    const { getExecutionContext } = await import( './index.js' );
    expect( getExecutionContext() ).toBeNull();
  } );

  it( 'returns workflow context when storage has full context', async () => {
    loadMock.mockReturnValue( {
      executionContext: { workflowId: 'wf-1', workflowName: 'myWorkflow' },
      workflowFilename: '/workflows/myWorkflow.js'
    } );
    const { getExecutionContext } = await import( './index.js' );
    expect( getExecutionContext() ).toEqual( {
      workflow: { id: 'wf-1', name: 'myWorkflow', filename: '/workflows/myWorkflow.js' }
    } );
  } );
} );
