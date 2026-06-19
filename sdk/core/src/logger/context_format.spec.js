import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadMock = vi.fn();
vi.mock( '#async_storage', () => ( {
  Storage: { load: loadMock }
} ) );

const activityInfo = {
  activityId: 'a1',
  activityType: 'myWf#step',
  workflowExecution: { workflowId: 'wf-1', runId: 'run-1' },
  workflowType: 'myWf'
};

describe( 'contextFormat', () => {
  beforeEach( () => {
    vi.clearAllMocks();
    vi.resetModules();
  } );

  it( 'injects workflow execution context when a step context is active', async () => {
    loadMock.mockReturnValue( { activityInfo } );
    const { contextFormat } = await import( './context_format.js' );

    const out = contextFormat().transform( { level: 'info', message: 'hi' } );

    expect( out ).toMatchObject( {
      message: 'hi',
      activityId: 'a1',
      activityType: 'myWf#step',
      workflowId: 'wf-1',
      workflowType: 'myWf',
      runId: 'run-1'
    } );
  } );

  it( 'leaves the entry untouched when there is no active context', async () => {
    loadMock.mockReturnValue( undefined );
    const { contextFormat } = await import( './context_format.js' );

    const out = contextFormat().transform( { level: 'info', message: 'hi' } );

    expect( out ).toEqual( { level: 'info', message: 'hi' } );
  } );

  it( 'does not overwrite caller-supplied fields', async () => {
    loadMock.mockReturnValue( { activityInfo } );
    const { contextFormat } = await import( './context_format.js' );

    const out = contextFormat().transform( { level: 'info', message: 'hi', workflowId: 'custom' } );

    expect( out.workflowId ).toBe( 'custom' );
  } );
} );
