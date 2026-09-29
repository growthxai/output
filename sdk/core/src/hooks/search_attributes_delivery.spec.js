import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mainEventBus, stepEventBus } from '#bus';
import { Storage } from '#async_storage';
import { createWorkflowDetails } from '#helpers/temporal_context';
import { sinks } from '../worker/sinks.js';
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
  memo: {},
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

  it( 'delivers them to workflow lifecycle hooks via the start sink', async () => {
    const handler = vi.fn();
    onWorkflowStart( handler );

    sinks.workflow.start.fn( structuredClone( workflowInfo ), {} );
    await flushHooks();

    expect( handler ).toHaveBeenCalledOnce();
    expect( handler.mock.calls[0][0].workflowDetails.searchAttributes ).toEqual( expectedSearchAttributes );
  } );

  it( 'delivers them to event hooks emitted inside activities, from round-tripped headers', async () => {
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
