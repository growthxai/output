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

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    expect( emitMock ).toHaveBeenCalledWith( 'external:cost:llm:request', expect.objectContaining( {
      workflowId: 'wf-1',
      runId: 'run-1',
      activityId: 'act-1',
      modelId: 'gpt-4o'
    } ) );
  } );

  it( 'handles missing executionContext gracefully', () => {
    loadMock.mockReturnValue( undefined );

    emitEvent( 'foo:bar', { x: 1 } );

    expect( emitMock ).toHaveBeenCalledWith( 'external:foo:bar', expect.objectContaining( {
      workflowId: undefined,
      runId: undefined,
      activityId: undefined,
      x: 1
    } ) );
  } );

  it( 'handles missing payload', () => {
    loadMock.mockReturnValue( {
      executionContext: { workflowId: 'wf-2', runId: 'run-2' },
      parentId: 'act-2'
    } );

    emitEvent( 'lifecycle:start' );

    expect( emitMock ).toHaveBeenCalledWith( 'external:lifecycle:start', expect.objectContaining( {
      workflowId: 'wf-2',
      runId: 'run-2',
      activityId: 'act-2'
    } ) );
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

    // Context fields are spread after the payload, so caller-supplied
    // workflowId / runId / activityId cannot escape the executionContext.
    expect( emitMock ).toHaveBeenCalledWith( 'external:cost:http:request', expect.objectContaining( {
      workflowId: 'wf-3',
      runId: 'run-3',
      activityId: 'act-3',
      url: 'https://example.com'
    } ) );
  } );

  it( 'stamps a UUID v4 eventId on every emit by default', () => {
    loadMock.mockReturnValue( {
      executionContext: { workflowId: 'wf-uuid', runId: 'run-uuid' },
      parentId: 'act-uuid'
    } );

    emitEvent( 'cost:llm:request', { modelId: 'gpt-4o' } );

    expect( emitMock ).toHaveBeenCalledWith( 'external:cost:llm:request', expect.objectContaining( {
      eventId: expect.stringMatching( UUID_V4_REGEX )
    } ) );
  } );

  it( 'gives distinct emits distinct eventIds', () => {
    loadMock.mockReturnValue( { executionContext: {}, parentId: 'a' } );

    emitEvent( 'cost:llm:request', { modelId: 'm' } );
    emitEvent( 'cost:llm:request', { modelId: 'm' } );

    const firstId = emitMock.mock.calls[0][1].eventId;
    const secondId = emitMock.mock.calls[1][1].eventId;
    expect( firstId ).toMatch( UUID_V4_REGEX );
    expect( secondId ).toMatch( UUID_V4_REGEX );
    expect( firstId ).not.toBe( secondId );
  } );

  it( 'preserves a caller-supplied eventId (deterministic retry case)', () => {
    loadMock.mockReturnValue( { executionContext: {}, parentId: 'a' } );

    emitEvent( 'cost:http:request', { eventId: 'caller-supplied-id', url: 'https://example.com' } );

    expect( emitMock ).toHaveBeenCalledWith( 'external:cost:http:request', expect.objectContaining( {
      eventId: 'caller-supplied-id',
      url: 'https://example.com'
    } ) );
  } );
} );
