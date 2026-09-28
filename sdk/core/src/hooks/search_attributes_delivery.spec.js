import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mainEventBus, stepEventBus } from '#bus';
import { BusEventType } from '#consts';
import { Storage } from '#async_storage';
import { createWorkflowDetails } from '#helpers/temporal_context';
import { headersToObject, memoToHeaders } from '../worker/interceptors/headers.js';
import { on, onWorkflowStart } from './index.js';
import { pendingHooks } from './pending_hooks.js';

const workflowInfo = {
  attempt: 1,
  firstExecutionRunId: 'run-1',
  runId: 'run-1',
  runStartTime: new Date( '2026-06-02T09:00:00.000Z' ),
  startTime: new Date( '2026-06-02T09:00:00.000Z' ),
  workflowId: 'wf-1',
  workflowType: 'prompt',
  searchAttributes: {
    CustomerId: [ 'cust-1' ],
    ScheduledAt: [ new Date( '2026-06-02T08:00:00.000Z' ) ]
  }
};

const expectedSearchAttributes = {
  CustomerId: [ 'cust-1' ],
  ScheduledAt: [ '2026-06-02T08:00:00.000Z' ]
};

const flushHooks = () => Promise.all( [ ...pendingHooks ] );

describe( 'hooks receive workflowDetails.searchAttributes', () => {
  beforeEach( () => {
    mainEventBus.removeAllListeners();
    stepEventBus.removeAllListeners();
    pendingHooks.clear();
  } );

  it( 'delivers them to workflow lifecycle hooks fed by sinks', async () => {
    const handler = vi.fn();
    onWorkflowStart( handler );

    mainEventBus.emit( BusEventType.WORKFLOW_START, { workflowDetails: createWorkflowDetails( structuredClone( workflowInfo ) ) } );
    await flushHooks();

    expect( handler ).toHaveBeenCalledOnce();
    expect( handler.mock.calls[0][0].workflowDetails.searchAttributes ).toEqual( expectedSearchAttributes );
  } );

  it( 'delivers them to generic event hooks emitted inside activities', async () => {
    const handler = vi.fn();
    on( 'llm:generation:metering', handler );

    const { workflowDetails } = headersToObject( memoToHeaders( { workflowDetails: createWorkflowDetails( workflowInfo ) } ) );
    Storage.runWithContext( () => stepEventBus.emit( 'sdk:llm:generation:metering', { cost: 1 } ), { workflowDetails } );
    await flushHooks();

    expect( handler ).toHaveBeenCalledOnce();
    expect( handler.mock.calls[0][0] ).toMatchObject( { payload: { cost: 1 } } );
    expect( handler.mock.calls[0][0].workflowDetails.searchAttributes ).toEqual( expectedSearchAttributes );
  } );
} );
