import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadMock = vi.hoisted( () => vi.fn() );
const emitMock = vi.hoisted( () => vi.fn() );

vi.mock( '#async_storage', () => ( {
  Storage: { load: loadMock }
} ) );

vi.mock( '#bus', () => ( {
  messageBus: { emit: emitMock }
} ) );

import { emit } from './events.js';

// `eventId` stamping is the bus layer's responsibility (see bus.spec.js).
// Assertions here use `objectContaining` so they don't have to know about that enrichment.
describe( 'emit', () => {
  beforeEach( () => {
    vi.clearAllMocks();
  } );

  it( 'forwards activityInfo, workflowDetails, and outputActivityKind from storage', () => {
    const activityInfo = {
      activityId: 'act-1',
      activityType: 'step',
      workflowExecution: { workflowId: 'wf-1', runId: 'run-1' },
      workflowType: 'workflow'
    };
    const workflowDetails = {
      workflowId: 'wf-1',
      runId: 'run-1',
      workflowType: 'workflow'
    };
    loadMock.mockReturnValue( {
      activityInfo,
      workflowDetails,
      outputActivityKind: 'step'
    } );

    emit( 'cost:llm:request', { modelId: 'gpt-4o' } );

    expect( emitMock ).toHaveBeenCalledWith( 'external:cost:llm:request', expect.objectContaining( {
      activityInfo,
      workflowDetails,
      outputActivityKind: 'step',
      modelId: 'gpt-4o'
    } ) );
  } );

  it( 'emits payload without context when storage is missing', () => {
    loadMock.mockReturnValue( undefined );

    emit( 'foo:bar', { x: 1 } );

    expect( emitMock ).toHaveBeenCalledWith( 'external:foo:bar', { x: 1 } );
  } );

  it( 'handles missing payload', () => {
    const activityInfo = {
      activityId: 'act-2',
      activityType: 'step',
      workflowExecution: { workflowId: 'wf-2', runId: 'run-2' },
      workflowType: 'workflow'
    };
    const workflowDetails = {
      workflowId: 'wf-2',
      runId: 'run-2',
      workflowType: 'workflow'
    };
    loadMock.mockReturnValue( {
      activityInfo,
      workflowDetails,
      outputActivityKind: 'step'
    } );

    emit( 'lifecycle:start' );

    expect( emitMock ).toHaveBeenCalledWith( 'external:lifecycle:start', expect.objectContaining( {
      activityInfo,
      workflowDetails,
      outputActivityKind: 'step'
    } ) );
  } );

  it( 'does not let payload override activityInfo, workflowDetails, or outputActivityKind', () => {
    const activityInfo = {
      activityId: 'act-3',
      activityType: 'step',
      workflowExecution: { workflowId: 'wf-3', runId: 'run-3' },
      workflowType: 'workflow'
    };
    const workflowDetails = {
      workflowId: 'wf-3',
      runId: 'run-3',
      workflowType: 'workflow'
    };
    loadMock.mockReturnValue( {
      activityInfo,
      workflowDetails,
      outputActivityKind: 'step'
    } );

    emit( 'cost:http:request', {
      activityInfo: { activityId: 'should-be-overridden' },
      workflowDetails: { workflowId: 'should-be-overridden' },
      outputActivityKind: 'should-be-overridden',
      url: 'https://example.com'
    } );

    expect( emitMock ).toHaveBeenCalledWith( 'external:cost:http:request', expect.objectContaining( {
      activityInfo,
      workflowDetails,
      outputActivityKind: 'step',
      url: 'https://example.com'
    } ) );
  } );
} );
