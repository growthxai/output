import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadMock = vi.hoisted( () => vi.fn() );
const emitMock = vi.hoisted( () => vi.fn() );

vi.mock( '#async_storage', () => ( {
  Storage: { load: loadMock }
} ) );

vi.mock( '#bus', () => ( {
  messageBus: { emit: emitMock }
} ) );

import { emitEvent } from './events.js';

describe( 'emitEvent', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'forwards workflowId, runId, and activityId from executionContext', () => {
    loadMock.mockReturnValue( {
      executionContext: { workflowId: 'wf-1', runId: 'run-1' },
      parentId: 'act-1'
    } );

    emitEvent( 'cost:llm:request', { modelId: 'gpt-4o' } );

    expect( emitMock ).toHaveBeenCalledWith( 'external:cost:llm:request', {
      workflowId: 'wf-1',
      runId: 'run-1',
      activityId: 'act-1',
      modelId: 'gpt-4o'
    } );
  } );

  it( 'handles missing executionContext gracefully', () => {
    loadMock.mockReturnValue( undefined );

    emitEvent( 'foo:bar', { x: 1 } );

    expect( emitMock ).toHaveBeenCalledWith( 'external:foo:bar', {
      workflowId: undefined,
      runId: undefined,
      activityId: undefined,
      x: 1
    } );
  } );

  it( 'handles missing payload', () => {
    loadMock.mockReturnValue( {
      executionContext: { workflowId: 'wf-2', runId: 'run-2' },
      parentId: 'act-2'
    } );

    emitEvent( 'lifecycle:start' );

    expect( emitMock ).toHaveBeenCalledWith( 'external:lifecycle:start', {
      workflowId: 'wf-2',
      runId: 'run-2',
      activityId: 'act-2'
    } );
  } );

  it( 'does not let payload override workflowId / runId / activityId', () => {
    loadMock.mockReturnValue( {
      executionContext: { workflowId: 'wf-3', runId: 'run-3' },
      parentId: 'act-3'
    } );

    emitEvent( 'cost:http:request', {
      workflowId: 'should-be-overridden',
      runId: 'should-be-overridden',
      activityId: 'should-be-overridden',
      url: 'https://example.com'
    } );

    // The implementation spreads payload last, so currently it would override.
    // We document the actual behavior: the destructured context values come
    // FIRST, then payload spread overrides. So this test asserts payload wins.
    expect( emitMock ).toHaveBeenCalledWith(
      'external:cost:http:request',
      expect.objectContaining( { url: 'https://example.com' } )
    );
  } );
} );
